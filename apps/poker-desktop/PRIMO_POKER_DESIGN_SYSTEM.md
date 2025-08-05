# Primo Poker Design System

## Design Philosophy
A sophisticated, culturally-inclusive design that blends Eastern minimalism with European elegance. The aesthetic emphasizes clarity, precision, and premium quality while being welcoming to international players.

## Color Palette

### Primary Colors
- **Primo Purple**: `#6B46C1` - Royal purple representing prestige and wisdom
- **Lucky Gold**: `#F59E0B` - Prosperity and fortune (important in Asian culture)
- **Deep Midnight**: `#0F172A` - Premium dark background
- **Pearl White**: `#F8FAFC` - Clean, sophisticated text

### Secondary Colors
- **Jade Green**: `#10B981` - Success, balance, and positive actions
- **Cherry Blossom**: `#EC4899` - Accent for special features and promotions
- **Sky Blue**: `#0EA5E9` - Information and notifications
- **Warm Gray**: `#6B7280` - Secondary text and borders

### Semantic Colors
- **Success**: `#10B981` (Jade Green)
- **Warning**: `#F59E0B` (Lucky Gold)
- **Error**: `#EF4444` (Soft Red)
- **Info**: `#0EA5E9` (Sky Blue)

### Background Layers
- **Base**: `#0F172A` (Deep Midnight)
- **Layer 1**: `#1E293B` (Raised surfaces)
- **Layer 2**: `#334155` (Hover states)
- **Layer 3**: `#475569` (Active states)

## Typography

### Font Stack
```css
font-family: 'Inter', 'Noto Sans CJK', 'Noto Sans', -apple-system, sans-serif;
```
- **Inter**: Modern, clean for Latin characters
- **Noto Sans CJK**: Excellent CJK (Chinese, Japanese, Korean) support
- Fallbacks ensure global compatibility

### Type Scale
- **Display**: 32px/40px - Major headings
- **Headline**: 24px/32px - Section titles
- **Title**: 20px/28px - Card titles
- **Body Large**: 16px/24px - Important text
- **Body**: 14px/20px - Standard text
- **Caption**: 12px/16px - Secondary info
- **Micro**: 10px/12px - Minimal labels

## Design Elements

### Card Design
```
┌─────────────────────────────┐
│ Subtle gradient border      │ ← 1px gradient border (#6B46C1 to #F59E0B)
│ ┌─────────────────────────┐ │
│ │                         │ │ ← Dark background (#1E293B)
│ │   Card Content          │ │ ← Soft shadow for depth
│ │                         │ │
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

### Button Styles
- **Primary**: Purple gradient with gold hover effect
- **Secondary**: Outlined with subtle glow
- **Success**: Jade green for positive actions
- **Ghost**: Transparent with hover reveal

### Icon System
- **Style**: Outlined icons for clarity
- **Lucky Symbols**: 
  - 🎰 Slot machine (Western lucky)
  - 🐉 Dragon (Eastern prosperity)
  - 🌸 Cherry blossom (Beauty/fortune)
  - ⭐ Star (Universal success)
  - 🏆 Trophy (Achievement)

### Patterns & Textures
- **Subtle Geometric**: Hexagon patterns (cards/chips reference)
- **Gradient Overlays**: Purple to gold for premium elements
- **Soft Shadows**: Multiple layers for depth without harshness

## Cultural Considerations

### Asian Market Appeal
1. **Lucky Numbers**: Highlight 8s and 9s in appropriate contexts
2. **Gold Accents**: Prosperity and fortune
3. **Red Elements**: Used sparingly for luck (not errors)
4. **Balanced Layouts**: Feng shui-inspired symmetry
5. **Respectful Imagery**: No culturally insensitive symbols

### European Market Appeal
1. **Sophisticated Typography**: Clean, professional
2. **Minimalist Design**: Less is more approach
3. **Premium Feel**: Quality over flashiness
4. **Privacy Focus**: Subtle, non-intrusive design
5. **Multi-language**: Easy-to-read for all Latin scripts

## Component Styling

### Lobby Specific Design

#### Top Navigation
```css
background: linear-gradient(180deg, #1E293B 0%, #0F172A 100%);
border-bottom: 1px solid rgba(107, 70, 193, 0.3);
```

#### Filter Sidebar
- Soft purple glow on active filters
- Smooth transitions on hover
- Grouped with subtle separators

#### Table List
- Alternating row backgrounds (subtle)
- Purple highlight on hover
- Gold accent for featured tables
- Green indicators for available seats

#### Preview Panel
- Elegant frame with gradient border
- Soft lighting effect on table visualization
- Premium feel with subtle animations

## Animation & Interaction

### Micro-interactions
- **Hover**: Soft glow and slight scale (1.02)
- **Click**: Quick pulse effect
- **Loading**: Elegant shimmer (not spinner)
- **Transitions**: 200ms ease-out for smoothness

### Feedback
- **Success**: Jade green pulse
- **Error**: Gentle shake (not harsh)
- **Progress**: Smooth gradient animation

## Accessibility

### Contrast Ratios
- All text meets WCAG AA standards
- Important elements meet AAA where possible
- Purple/Gold tested for colorblind users

### International Support
- RTL layout support for Arabic/Hebrew
- Flexible spacing for text expansion
- Icon + text combinations for clarity

## Implementation Example

### CSS Variables
```css
:root {
  /* Primary Palette */
  --primo-purple: #6B46C1;
  --lucky-gold: #F59E0B;
  --deep-midnight: #0F172A;
  --pearl-white: #F8FAFC;
  
  /* Backgrounds */
  --bg-base: #0F172A;
  --bg-layer-1: #1E293B;
  --bg-layer-2: #334155;
  --bg-layer-3: #475569;
  
  /* Gradients */
  --gradient-primary: linear-gradient(135deg, #6B46C1 0%, #F59E0B 100%);
  --gradient-subtle: linear-gradient(180deg, #1E293B 0%, #0F172A 100%);
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --shadow-glow: 0 0 20px rgba(107, 70, 193, 0.3);
}
```

## Unique Brand Elements

### Primo Poker Signature
1. **The Golden Ratio**: Used in layout proportions
2. **Hexagon Motif**: Subtle pattern representing chips
3. **Gradient Borders**: Purple-to-gold on premium elements
4. **Soft Glow Effects**: Creating depth without harshness
5. **Cultural Fusion**: Balanced Eastern/Western aesthetics

### Differentiators
- Not as dark as Full Tilt (more approachable)
- Not as bright as PokerStars (more sophisticated)
- Not as red as Asian poker sites (more universal)
- Not as stark as GGPoker (warmer feeling)

This design system creates a unique identity for Primo Poker that appeals to international audiences while maintaining a premium, professional appearance.