---
name: console-header-about-menu
overview: 改造 Console 页面左上角 NavyNavi 标头：点击后弹出下拉菜单，支持"About NavyNavi.."（打开居中关于对话框）和"Quit Console"（返回主页）。
todos:
  - id: convert-navy-header
    content: 将 NavyNavi 标头改为下拉菜单触发器并添加菜单项
    status: completed
  - id: add-about-modal
    content: 在 Console 页面实现 About NavyNavi 居中模态对话框
    status: completed
    dependencies:
      - convert-navy-header
  - id: wire-interactions
    content: 绑定外部点击关闭、Esc 关闭、Quit Console 跳转逻辑
    status: completed
    dependencies:
      - convert-navy-header
      - add-about-modal
---

## 用户需求

在 Console 页面左上角，将现有的 "NavyNavi" 标头从直接跳转链接改为可点击展开的下拉菜单触发器。下拉菜单包含两项：

- **About NavyNavi..**：点击后在屏幕中央弹出关于对话框，展示应用名称、版本、版权等基本信息。
- **Quit Console**：点击后导航回主页面（`/`）。

## 产品概述

对 NavyNavi 控制台顶部菜单栏进行交互增强，使其具备应用级菜单入口（App Menu），符合常见桌面应用菜单的交互模式（如 macOS 的 Apple 菜单或 Windows 的应用菜单）。

## 核心功能

- 点击 "NavyNavi" 标头展开/收起下拉菜单。
- 下拉菜单中提供 "About NavyNavi.." 和 "Quit Console" 两个选项。
- 点击 "About NavyNavi.." 弹出居中的模态对话框，包含应用名称、版本号、版权信息。
- 点击 "Quit Console" 使用 React Router 导航到主页面。
- 点击菜单外部区域可关闭下拉菜单。
- 视觉风格与现有 Tools 下拉菜单保持一致。

## 技术栈

- **框架**：React 19 + TypeScript
- **构建工具**：Vite
- **路由**：react-router-dom
- **样式**：Tailwind CSS v4 + 自定义 CSS 变量
- **图标**：lucide-react
- **地图**：maplibre-gl

## 实现方案

参考现有 `Tools` 下拉菜单的实现模式，将 `NavyNavi` 标头从 `Link` 改为 `button`，绑定本地状态控制下拉菜单显示。新增 `About NavyNavi` 模态对话框，使用固定定位（fixed）、半透明背景遮罩和居中卡片布局实现。`Quit Console` 通过 `useNavigate` 导航到 `/`。

为保持代码简洁和可维护性，将下拉菜单状态、模态框状态及对应的关闭/打开逻辑集中在 `Console.tsx` 中实现，不新增独立组件文件（除非后续需要复用）。对外部点击和 Esc 键关闭模态框提供基本支持。

## 执行要点

- 将 `NavyNavi` 从 `Link` 替换为 `button`，避免与下拉菜单的冲突。
- 复用现有下拉菜单的 Tailwind 类名（如 `bg-secondary/85`、`rounded-md`、`shadow-md` 等），保持视觉一致性。
- 模态框使用 `z-50` 确保覆盖地图层（地图容器 z-index 低于菜单栏）。
- 使用 `useNavigate` 实现 "Quit Console" 跳转，与现有路由保持一致。
- 下拉菜单添加 `useEffect` 监听全局 `mousedown` 事件，点击菜单外部时关闭。
- 模态框支持 `Escape` 键关闭和点击遮罩关闭。

## 架构设计

无需修改整体架构，仅在 `Console.tsx` 组件内扩展状态管理和 UI 渲染：

```
Console.tsx
  ├── NavyNavi 标头（触发器）
  ├── NavyNavi 下拉菜单
  │     ├── About NavyNavi..
  │     └── Quit Console
  └── About NavyNavi 模态对话框
```

## 目录结构

```
e:/term/navi_navy/
└── src/
    └── pages/
        └── Console.tsx   # [MODIFY] 改造 NavyNavi 标头为下拉菜单，新增 About 模态框
```

## 关键代码结构

```typescript
// 新增状态
const [navyMenuOpen, setNavyMenuOpen] = useState(false)
const [aboutOpen, setAboutOpen] = useState(false)
const navyMenuRef = useRef<HTMLDivElement>(null)
const navigate = useNavigate()

// 菜单项
const NAVY_MENU = [
  { label: 'About NavyNavi..', action: () => setAboutOpen(true) },
  { label: 'Quit Console', action: () => navigate('/') },
]
```