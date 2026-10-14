import { Icon } from '../../components/Icons'
import { useAppStore, type SidebarView } from '../../stores/appStore'

const VIEWS: Array<{ id: SidebarView; icon: string; label: string; ready: boolean }> = [
  { id: 'files', icon: 'folder', label: '文件', ready: true },
  { id: 'search', icon: 'search', label: '搜索', ready: false },
  { id: 'tags', icon: 'tag', label: '标签', ready: false }
]

/** 左侧最窄的一条垂直导航 */
export function NavRail(): React.JSX.Element {
  const view = useAppStore((state) => state.sidebarView)
  const setView = useAppStore((state) => state.setSidebarView)
  const toast = useAppStore((state) => state.toast)

  return (
    <nav className="nav-rail" aria-label="主导航">
      {VIEWS.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`nav-rail-btn${view === item.id ? ' is-active' : ''}`}
          title={item.ready ? item.label : `${item.label}（V1.0 提供）`}
          aria-pressed={view === item.id}
          onClick={() => {
            if (!item.ready) {
              toast(`${item.label}功能将在 V1.0（全文搜索 / 标签筛选）中提供`, 'info')
              return
            }
            setView(item.id)
          }}
        >
          <Icon name={item.icon} size={17} />
        </button>
      ))}
    </nav>
  )
}
