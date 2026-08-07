---
name: MallBay
description: 清晰可靠的漆面保护膜门店运营工作台
colors:
  primary: "#0f3a5f"
  primary-container: "#e6f0f8"
  primary-fixed: "#d1e4ff"
  primary-fixed-dim: "#a5c9f6"
  on-primary: "#ffffff"
  secondary: "#475569"
  tertiary: "#d71920"
  background: "#f6f8fb"
  surface: "#ffffff"
  surface-alt: "#eef3f8"
  surface-container-low: "#f3f4f6"
  surface-container: "#edeef0"
  text-primary: "#111827"
  text-secondary: "#4b5563"
  text-muted: "#6b7280"
  border: "#d9e2ec"
  border-subtle: "#edf2f7"
  success: "#16a34a"
  success-container: "#dcfce7"
  warning: "#f59e0b"
  warning-container: "#fef3c7"
  danger: "#dc2626"
  danger-container: "#fee2e2"
  info: "#2563eb"
  info-container: "#dbeafe"
typography:
  display:
    fontFamily: "Noto Sans SC, Inter, system-ui, sans-serif"
    fontSize: "38px"
    fontWeight: 800
    lineHeight: 1.18
  headline:
    fontFamily: "Noto Sans SC, Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 850
    lineHeight: "36px"
  title:
    fontFamily: "Noto Sans SC, Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.32
  body:
    fontFamily: "Noto Sans SC, Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Noto Sans SC, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: "18px"
rounded:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
  pill: "999px"
spacing:
  page: "32px"
  page-mobile: "18px 16px"
  section: "20px"
  card: "16px"
  control: "8px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.md}"
    height: "40px"
    padding: "0 16px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.lg}"
    padding: "16px"
  input:
    backgroundColor: "{colors.surface-container-low}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: "40px"
  nav-active:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    height: "44px"
---

# Design System: MallBay

## Overview

**Creative North Star: "清晰可靠的门店工作台"**

MallBay 的界面应像门店每天依赖的运营工作台：可靠、清楚、能快速告诉使用者当前发生了什么，以及下一步该做什么。深蓝是稳定的品牌锚点，浅灰背景和白色表面构成安静的工作底板，业务状态通过有限且有语义的颜色表达。

视觉方向采用结构化卡片与轻量阴影。卡片不是装饰，而是用于把 KPI、筛选、列表、待办和流程阶段分组；边界保持克制，阴影只提供轻微层次，避免让后台变成堆叠的浮层。操作反馈要明确：活动导航、主要按钮、状态标签、悬停和聚焦都应让用户知道当前上下文。

**Key Characteristics:**

- 深蓝品牌锚点与冷静的中性工作背景
- 结构化信息分组，优先服务扫描和决策
- 克制圆角、轻量阴影、清楚边界
- 统一的状态语义和明确的操作反馈
- 桌面端高效工作，900px 以下转为触控友好的移动导航

## Colors

Palette character: a dependable deep navy system on cool paper-like neutrals, with restrained semantic colors for operational status.

### Primary

- **门店深蓝** (#0f3a5f): Brand anchor for the management shell, primary actions, active navigation, and important headings.
- **浅蓝容器** (#e6f0f8): Active navigation and selected/related content surfaces.
- **固定浅蓝** (#d1e4ff): Avatar fills, supporting emphasis, and cool blue highlights.
- **固定柔蓝** (#a5c9f6): Secondary text and supporting content on the deep-blue shell.

### Secondary

- **石板灰** (#475569): Secondary text, quiet controls, and supporting operational copy.

### Tertiary

- **风险红** (#d71920): High-attention brand/status accent where the existing interface calls for a strong warning signal.

### Neutral

- **工作背景** (#f6f8fb): Global management canvas.
- **表面白** (#ffffff): Cards, forms, panels, and elevated working surfaces.
- **辅助表面** (#eef3f8): Cool tinted supporting surface.
- **低层表面** (#f3f4f6): Search fields, quiet filters, and low-emphasis containers.
- **容器表面** (#edeef0): Tonal grouping where a white card would add unnecessary enclosure.
- **主文字** (#111827): Primary content and headings.
- **次文字** (#4b5563): Supporting content and secondary controls.
- **弱文字** (#6b7280): Descriptions, metadata, and quiet labels.
- **边界** (#d9e2ec): Main dividers, fields, and card boundaries.
- **细边界** (#edf2f7): Quiet row separators and subtle divisions.

### Named Rules

**The Deep-Blue Anchor Rule.** Deep blue establishes navigation, primary action, and operational authority; semantic colors should not compete with it.

**The Status-Has-Meaning Rule.** Green, amber, red, and blue are reserved for recognizable business states, not decoration.

## Typography

**Display Font:** Noto Sans SC, with Inter and system-ui fallbacks.
**Body Font:** Noto Sans SC, with Inter and system-ui fallbacks.
**Label/Mono Font:** No distinct label or mono face is established.

**Character:** Chinese-first, practical, and high legibility. Weight carries hierarchy more than dramatic size changes; labels are firm enough for dense operational screens while descriptions remain quiet.

### Hierarchy

- **Display** (800, 38px, 1.18): Authentication and high-impact introductory messaging.
- **Headline** (850, 28px, 36px): Management page titles and major workspace headings.
- **Title** (700, 24px, 1.32): Section and form headings.
- **Body** (400, 14px, 1.6): Primary operational copy and descriptions.
- **Label** (700, 13px, 18px): Field labels, KPI labels, and compact controls.

### Named Rules

**The Scan-First Type Rule.** Make the page title, next action, current status, and key value easy to locate before asking the user to read supporting copy.

## Layout

The management experience uses a fixed 240px deep-blue sidebar, a sticky 64px top bar, and a centered content region capped at 1440px. Standard page content uses a 32px desktop inset and a 20px vertical section rhythm. Pages are composed as a sequence of title/action header, summary or status strip, filter/work queue, and the main data or detail workspace.

The sidebar groups navigation by business domain and keeps the active item visibly connected to its group. The top bar holds store context on the left, global search in the middle, and notifications, role switching, and account actions on the right. Panels use CSS grid for KPI and filter layouts, with the content itself remaining fluid rather than forcing a narrow fixed canvas.

At 900px and below, the sidebar is replaced by a fixed bottom navigation with five contextual items. The top bar becomes 58px high, global search and role switching are hidden, and content uses 18px 16px padding with additional bottom space for the navigation. Touch targets remain comfortably sized and dense tables should provide mobile card alternatives where the current surface already supports them.

### Named Rules

**The Workbench Frame Rule.** Every management page should make its page title, primary action, current state, and main work area legible inside the shared shell.

**The One Canvas Rule.** Use surface changes and spacing to group work before adding another bordered card.

## Elevation & Depth

MallBay uses a hybrid of tonal layering and restrained ambient elevation. White surfaces sit on a cool light-gray canvas; borders establish structure and a soft shadow confirms a card or floating control without making the interface feel glossy. Elevation should remain quiet at rest and become more noticeable only for sticky navigation, search results, menus, or transient controls.

### Shadow Vocabulary

- **Ambient-low** (`0 1px 2px rgb(15 23 42 / 0.05), 0 8px 22px rgb(15 23 42 / 0.04)`): Default KPI cards, filter cards, and contained work surfaces.
- **Ambient-medium** (`0 10px 30px rgb(15 23 42 / 0.08)`): Clearly elevated transient surfaces and larger floating panels.
- **Brand-action** (`0 10px 22px rgb(15 58 95 / 0.16)`): Role switcher and other high-confidence primary controls.

### Named Rules

**The Quiet-Elevation Rule.** Shadows should explain hierarchy, not advertise decoration; if a border and tonal shift are enough, do not add a stronger shadow.

## Shapes

The form language is gently rounded but operational rather than playful. Small controls use 4–10px radii, work surfaces use 16px radii, and status tags or avatar controls use pill geometry. Borders are cool and quiet, with rounded corners helping users read panels as intentional groups without turning every row into a separate tile.

## Components

### Buttons

- **Shape:** Compact, gently rounded controls (10px radius) with 40px default height; larger auth actions use 52px height.
- **Primary:** Deep-blue background with white text and firm weight; use for the page's decisive action.
- **Hover / Focus:** Deepen or shift the blue treatment, add a small elevation response, and retain a visible focus indicator.
- **Secondary / Ghost / Tertiary:** Use neutral borders or tonal surfaces for supporting actions; avoid presenting several actions with equal visual authority.

### Chips

- **Style:** Status and role tags use pill geometry, semantic fills, and compact weighted text.
- **State:** Selected or active chips use the deep-blue family; warning, success, danger, and info colors communicate workflow state.

### Cards / Containers

- **Corner Style:** 16px for primary work surfaces; 10px for compact panels and controls.
- **Background:** White on the global cool-gray canvas, with cool tinted surfaces for low-emphasis areas.
- **Shadow Strategy:** Use ambient-low by default; reserve medium elevation for floating or transient surfaces.
- **Border:** Use the main border for clear panels and the subtle border for row separators.
- **Internal Padding:** 16px is the shared card rhythm; page sections remain separated by 20px.

### Inputs / Fields

- **Style:** 40px controls, 10px radius, cool border, and a low-emphasis gray field background where appropriate.
- **Focus:** Shift the border and ring toward the primary blue with a clear keyboard-visible state.
- **Error / Disabled:** Preserve readable semantic color and contrast; never rely on color alone to communicate the state.

### Navigation

- **Style:** A 240px deep-blue sidebar with grouped domain navigation, 44px primary rows, and 38px submenu rows.
- **Default / Hover:** Muted light-blue text on transparent background; hover introduces a restrained translucent blue surface.
- **Active:** Light-blue container, deep-blue text, strong weight, and a left inset accent line.
- **Mobile:** Replace the sidebar with a floating bottom navigation bar at the 900px breakpoint.

### KPI Tiles

- **Style:** White 16px-radius cards with a quiet border and ambient-low shadow.
- **Hierarchy:** Muted label, prominent deep-blue value, then a small explanatory note. Values should remain scannable even when the content is long.

## Do's and Don'ts

### Do:

- **Do** use the deep-blue family to establish navigation, primary action, and store context.
- **Do** group related business content into structured surfaces with 16px internal rhythm.
- **Do** make the next operational action and current status obvious through hierarchy and semantic feedback.
- **Do** use subtle borders and tonal surfaces before stronger shadows.
- **Do** preserve the shared 240px sidebar, 64px top bar, 32px desktop content inset, and 900px responsive breakpoint unless a surface has a documented reason to diverge.
- **Do** provide mobile card or touch-friendly alternatives for dense tabular workflows.

### Don't:

- **Don't** turn every row, filter, or small control into a separate floating card.
- **Don't** use the tertiary red or other semantic colors as decorative accents.
- **Don't** create competing primary actions in the same page region.
- **Don't** hide important workflow state in color alone.
- **Don't** use heavy shadows, glassmorphism, gradients, or ornamental visual effects that reduce operational clarity.
