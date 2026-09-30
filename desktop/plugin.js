/**
 * model-favorites — star the models you actually use.
 *
 * A star chip in the composer opens a searchable popover: your Favorites are
 * pinned at the top, every configured model sits below grouped by provider.
 * Right-click any row to add or remove a favorite (a hover star does the same
 * for mouse-shy discoverability). Picking a row switches the focused chat's
 * model for that session only — it never rewrites your default model.
 *
 * SDK-only: gateway RPC (`model.options`, `config.set`), the shared guarded
 * switch confirm, and the plugin's own storage. No DOM reach-in.
 *
 * Plain ESM, loaded uncompiled. Only @hermes/plugin-sdk, react, react/jsx-runtime.
 */

import {
  atom,
  cn,
  Codicon,
  COMPOSER_AREAS,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  haptic,
  host,
  PALETTE_AREA,
  Popover,
  PopoverContent,
  PopoverTrigger,
  queryClient,
  SearchField,
  surfaceModelSwitchConfirm,
  Tip,
  useQuery,
  usePluginI18n,
  useValue
} from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'model-favorites'
const STORAGE_KEY = 'favorites'
// Plugin files are not Tailwind-scanned. Arbitrary classes like max-h-[...] never
// ship, so the list grew to full height and had nothing to scroll. Height and
// overflow live in inline style, which the runtime always applies.
const LIST_STYLE = {
  maxHeight: 'min(22rem, calc(var(--radix-popover-content-available-height, 70dvh) - 5.5rem))',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  scrollbarWidth: 'thin'
}

/** `provider::model` keys in the order they were starred. */
const $favorites = atom([])

let storage = null
let translate = key => key

const keyOf = (provider, model) => `${provider}::${model}`

function splitKey(key) {
  const at = key.indexOf('::')

  return at < 0 ? null : { provider: key.slice(0, at), model: key.slice(at + 2) }
}

/** Scroll the list from wheel anywhere in the panel. RemoveScroll preventDefault does not block scrollTop. */
function useForcedWheel(hostRef, listRef) {
  useEffect(() => {
    const host = hostRef.current
    const list = listRef.current

    if (!host || !list) {
      return undefined
    }

    const onWheel = event => {
      if (list.scrollHeight <= list.clientHeight + 1) {
        return
      }

      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? list.clientHeight : 1
      const next = Math.max(0, Math.min(list.scrollHeight - list.clientHeight, list.scrollTop + event.deltaY * unit))

      if (next === list.scrollTop) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      list.scrollTop = next
    }

    host.addEventListener('wheel', onWheel, { capture: true, passive: false })

    return () => host.removeEventListener('wheel', onWheel, { capture: true })
  }, [hostRef, listRef])
}

function pageList(listRef, direction) {
  const list = listRef.current

  if (!list) {
    return
  }

  list.scrollBy({ top: direction * Math.max(72, Math.floor(list.clientHeight * 0.85)), behavior: 'smooth' })
}

function saveFavorites(next) {
  $favorites.set(next)
  storage?.set(STORAGE_KEY, next)
}

function toggleFavorite(provider, model) {
  const key = keyOf(provider, model)
  const current = $favorites.get()

  saveFavorites(current.includes(key) ? current.filter(entry => entry !== key) : [...current, key])
  haptic('tap')
}

function sessionId() {
  return String(host.state.focusedSessionId.get() || host.state.activeSessionId.get() || '').trim()
}

function fetchOptions(sid) {
  return host.request('model.options', { explicit_only: true, ...(sid ? { session_id: sid } : {}) })
}

function refreshCatalogs() {
  void queryClient.invalidateQueries({ queryKey: ['model-options'] })
  void queryClient.invalidateQueries({ queryKey: [ID] })
}

/** Switch the focused chat's model for this session only. Returns true when applied. */
async function switchModel(provider, model) {
  const sid = sessionId()

  if (!sid) {
    host.notify({ kind: 'info', message: translate('needSession') })

    return false
  }

  const send = (confirmExpensiveModel = false) =>
    host.request('config.set', {
      session_id: sid,
      key: 'model',
      value: `${model} --provider ${provider} --session`,
      ...(confirmExpensiveModel ? { confirm_expensive_model: true } : {})
    })

  try {
    const result = await send()

    if (result?.confirm_required) {
      // Data-policy / expensive-model guard: the app's own confirm dialog owns the decision.
      void surfaceModelSwitchConfirm({
        confirmMessage: result.confirm_message,
        failureMessage: translate('switchFailed'),
        finish: refreshCatalogs,
        isStale: () => sessionId() !== sid,
        model,
        requestConfirmed: () => send(true)
      })

      return false
    }

    if (!result?.deferred) {
      refreshCatalogs()
    }

    return true
  } catch (err) {
    host.notifyError(err, translate('switchFailed'))

    return false
  }
}

function ModelRow({ current, onPicked, provider, providerName, model, showProvider }) {
  const t = usePluginI18n(ID)
  const favorites = useValue($favorites)
  const starred = favorites.includes(keyOf(provider, model))

  return jsxs(ContextMenu, {
    children: [
      jsx(ContextMenuTrigger, {
        asChild: true,
        children: jsxs('div', {
          className: cn(
            'group/row flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1 text-xs',
            'hover:bg-(--ui-control-active-background) hover:text-foreground'
          ),
          style: { maxWidth: '100%', width: 'max-content' },
          onClick: () => {
            onPicked()

            if (!current) {
              void switchModel(provider, model)
            }
          },
          role: 'option',
          'aria-selected': current,
          children: [
            // Model id never ellipsizes. The panel grows to the name; only a name
            // wider than the viewport wraps, and it wraps in full. The provider
            // sits under it so a long label ("xAI Grok OAuth (SuperGrok / …)")
            // cannot steal the row.
            jsxs('span', {
              children: [
                jsx('span', {
                  className: 'block',
                  style: { overflowWrap: 'anywhere', wordBreak: 'break-word' },
                  title: model,
                  children: model
                }),
                showProvider
                  ? jsx('span', {
                      className: 'block text-[0.625rem] text-(--ui-text-tertiary)',
                      style: { overflowWrap: 'anywhere', wordBreak: 'break-word' },
                      title: providerName,
                      children: providerName
                    })
                  : null
              ]
            }),
            jsx('button', {
              'aria-label': starred ? t('remove') : t('add'),
              className: cn(
                'shrink-0 text-(--ui-text-tertiary) transition-opacity hover:text-foreground',
                starred ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'
              ),
              onClick: event => {
                event.stopPropagation()
                toggleFavorite(provider, model)
              },
              type: 'button',
              children: jsx(Codicon, { name: starred ? 'star-full' : 'star-empty', size: '0.75rem' })
            }),
            current ? jsx(Codicon, { className: 'shrink-0 text-foreground', name: 'check', size: '0.75rem' }) : null
          ]
        })
      }),
      jsx(ContextMenuContent, {
        children: jsxs(ContextMenuItem, {
          onSelect: () => toggleFavorite(provider, model),
          children: [
            jsx(Codicon, { name: starred ? 'star-full' : 'star-empty', size: '0.75rem' }),
            starred ? t('remove') : t('add')
          ]
        })
      })
    ]
  })
}

function SectionLabel({ children }) {
  return jsx('div', {
    className: 'px-2.5 pb-0.5 pt-1.5 text-[0.625rem] font-semibold uppercase tracking-wider text-(--ui-text-tertiary)',
    children
  })
}

function FavoritesPanel({ onPicked }) {
  const t = usePluginI18n(ID)
  const favorites = useValue($favorites)
  const [query, setQuery] = useState('')
  const listRef = useRef(null)
  const panelRef = useRef(null)
  const sid = sessionId()

  useForcedWheel(panelRef, listRef)

  const options = useQuery({
    queryKey: [ID, 'options', sid || 'global'],
    queryFn: () => fetchOptions(sid),
    staleTime: 60_000
  })

  const providers = (options.data?.providers ?? []).filter(row => (row.models?.length ?? 0) > 0)
  const currentProvider = options.data?.provider ?? ''
  const currentModel = options.data?.model ?? ''
  const isCurrent = (row, model) => model === currentModel && (row.slug === currentProvider || row.name === currentProvider)
  const q = query.trim().toLowerCase()

  // Favorites resolve against the live catalog so a stale key (provider removed, model
  // retired) simply doesn't render — it stays stored in case the provider comes back.
  const favoriteRows = q
    ? []
    : favorites
        .map(key => {
          const parts = splitKey(key)
          const row = parts && providers.find(candidate => candidate.slug === parts.provider)

          return row && row.models.includes(parts.model) ? { model: parts.model, row } : null
        })
        .filter(Boolean)

  const groups = [...providers]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(row => {
      const models = q
        ? row.models.filter(model => `${model} ${row.name} ${row.slug}`.toLowerCase().includes(q))
        : row.models

      return { models, row }
    })
    .filter(group => group.models.length > 0)

  const children = []

  if (favoriteRows.length > 0) {
    children.push(
      jsx(SectionLabel, { children: t('favorites') }, 'fav-label'),
      ...favoriteRows.map(({ model, row }) =>
        jsx(
          ModelRow,
          {
            current: isCurrent(row, model),
            model,
            onPicked,
            provider: row.slug,
            providerName: row.name,
            showProvider: true
          },
          `fav:${row.slug}:${model}`
        )
      ),
      jsx('div', { className: 'my-1 h-px bg-(--ui-stroke-tertiary)' }, 'fav-sep')
    )
  }

  for (const group of groups) {
    children.push(
      jsx(SectionLabel, { children: group.row.name }, `label:${group.row.slug}`),
      ...group.models.map(model =>
        jsx(
          ModelRow,
          {
            current: isCurrent(group.row, model),
            model,
            onPicked,
            provider: group.row.slug,
            providerName: group.row.name,
            showProvider: false
          },
          `${group.row.slug}:${model}`
        )
      )
    )
  }

  const empty = options.isPending
    ? t('loading')
    : options.error
      ? t('loadFailed')
      : children.length === 0
        ? t('noModels')
        : null

  return jsxs('div', {
    className: 'flex flex-col',
    ref: panelRef,
    // Inline, not Tailwind: plugin files are not scanned, and the popover's
    // own w-72 would otherwise clip every long model id.
    style: { maxWidth: 'min(40rem, calc(100vw - 1.5rem))', minWidth: '18rem', width: 'max-content' },
    children: [
      jsx('div', {
        className: 'px-2 pt-1',
        children: jsx(SearchField, { 'aria-label': t('search'), onChange: setQuery, placeholder: t('search'), value: query })
      }),
      jsx('div', {
        className: 'py-1',
        ref: listRef,
        role: 'listbox',
        style: LIST_STYLE,
        children: empty
          ? jsx('div', { className: 'px-2.5 py-2 text-xs text-(--ui-text-tertiary)', children: empty })
          : children
      }),
      jsxs('div', {
        className: 'flex items-center gap-1 border-t border-(--ui-stroke-tertiary) px-1.5 py-1',
        children: [
          jsx('span', {
            className: 'min-w-0 flex-1 px-1 text-[0.625rem] text-(--ui-text-tertiary)',
            children: t('hint')
          }),
          jsx('button', {
            'aria-label': t('scrollUp'),
            className: 'inline-flex h-6 w-6 items-center justify-center rounded-md text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
            onClick: () => pageList(listRef, -1),
            title: t('scrollUp'),
            type: 'button',
            children: jsx(Codicon, { name: 'chevron-up', size: '0.75rem' })
          }),
          jsx('button', {
            'aria-label': t('scrollDown'),
            className: 'inline-flex h-6 w-6 items-center justify-center rounded-md text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
            onClick: () => pageList(listRef, 1),
            title: t('scrollDown'),
            type: 'button',
            children: jsx(Codicon, { name: 'chevron-down', size: '0.75rem' })
          })
        ]
      })
    ]
  })
}

function FavoritesChip() {
  const t = usePluginI18n(ID)
  const [open, setOpen] = useState(false)

  return jsxs(Popover, {
    onOpenChange: setOpen,
    open,
    children: [
      jsx(PopoverTrigger, {
        asChild: true,
        children: jsx('button', {
          'aria-label': t('chip'),
          className: cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors',
            'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
            open && 'bg-(--ui-control-active-background) text-foreground'
          ),
          title: t('chip'),
          type: 'button',
          children: jsx(Codicon, { name: 'star-full', size: '0.875rem' })
        })
      }),
      jsx(PopoverContent, {
        align: 'end',
        className: 'w-auto p-1',
        side: 'top',
        // Beats the default variant's w-72 (class specificity loses to inline).
        style: { maxWidth: 'min(40rem, calc(100vw - 1.5rem))', width: 'max-content' },
        children: jsx(FavoritesPanel, { onPicked: () => setOpen(false) })
      })
    ]
  })
}

async function toggleCurrentModel() {
  try {
    const options = await fetchOptions(sessionId())

    if (!options?.model || !options?.provider) {
      host.notify({ kind: 'info', message: translate('noCurrent') })

      return
    }

    // `provider` here can be a display name or alias; resolve to the catalog slug.
    const row = (options.providers ?? []).find(
      candidate =>
        candidate.slug === options.provider ||
        candidate.name === options.provider ||
        (candidate.aliases ?? []).includes(options.provider)
    )

    const slug = row?.slug ?? options.provider

    toggleFavorite(slug, options.model)

    host.notify({
      kind: 'info',
      message: $favorites.get().includes(keyOf(slug, options.model))
        ? translate('addedToast', options.model)
        : translate('removedToast', options.model)
    })
  } catch (err) {
    host.notifyError(err, translate('loadFailed'))
  }
}

export default {
  id: ID, // must match the folder name
  name: 'Model Favorites',
  register(ctx) {
    storage = ctx.storage
    translate = (key, ...args) => ctx.i18n.t(key, ...args)

    const stored = ctx.storage.get(STORAGE_KEY, [])

    $favorites.set(Array.isArray(stored) ? stored.filter(entry => typeof entry === 'string' && entry.includes('::')) : [])
    ctx.onDispose(() => {
      storage = null
    })

    ctx.i18n.register({
      en: {
        chip: 'Favorite models',
        favorites: 'Favorites',
        search: 'Search models',
        add: 'Add to favorites',
        remove: 'Remove from favorites',
        hint: 'Right-click a model to favorite it',
        scrollUp: 'Scroll up',
        scrollDown: 'Scroll down',
        loading: 'Loading models…',
        loadFailed: 'Could not load models',
        noModels: 'No models found',
        needSession: 'Open or start a chat first, then pick a model.',
        switchFailed: 'Could not switch model',
        noCurrent: 'No current model to favorite yet.',
        addedToast: model => `Added ${model} to favorites`,
        removedToast: model => `Removed ${model} from favorites`,
        toggleCurrent: 'Favorite models: toggle current model'
      },
      es: {
        chip: 'Modelos favoritos',
        favorites: 'Favoritos',
        search: 'Buscar modelos',
        add: 'Añadir a favoritos',
        remove: 'Quitar de favoritos',
        hint: 'Clic derecho en un modelo para marcarlo',
        scrollUp: 'Desplazar hacia arriba',
        scrollDown: 'Desplazar hacia abajo',
        loading: 'Cargando modelos…',
        loadFailed: 'No se pudieron cargar los modelos',
        noModels: 'No se encontraron modelos',
        needSession: 'Abre o inicia un chat primero y luego elige un modelo.',
        switchFailed: 'No se pudo cambiar el modelo',
        noCurrent: 'Todavía no hay un modelo actual.',
        addedToast: model => `${model} añadido a favoritos`,
        removedToast: model => `${model} quitado de favoritos`,
        toggleCurrent: 'Modelos favoritos: alternar modelo actual'
      }
    })

    ctx.register({
      id: 'chip',
      area: COMPOSER_AREAS.actions,
      order: 10,
      render: () => jsx(FavoritesChip, {})
    })

    ctx.register({
      id: 'toggle-current',
      area: PALETTE_AREA,
      data: {
        id: `${ID}.toggle-current`,
        label: 'Favorite models: toggle current model',
        keywords: ['favorite', 'favourite', 'star', 'model', 'pin'],
        run: () => void toggleCurrentModel()
      }
    })
  }
}
