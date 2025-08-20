# Shared Components Library

This directory contains reusable UI components that promote consistency and reduce code duplication across the application.

## Available Components

### LoadingSpinner
A customizable loading spinner component.

```typescript
<LoadingSpinner size="md" label="Loading..." />
```

**Props:**
- `size`: 'sm' | 'md' | 'lg' (default: 'md')
- `className`: Additional CSS classes
- `label`: Screen reader label (default: 'Loading...')

### ErrorMessage
Displays error messages with optional retry functionality.

```typescript
<ErrorMessage 
  error={error} 
  onRetry={() => refetch()} 
/>
```

**Props:**
- `error`: Error | string | null
- `onRetry`: Optional retry callback
- `className`: Additional CSS classes

### CollapsibleSection
A collapsible section with animated expand/collapse.

```typescript
<CollapsibleSection 
  title="Filters" 
  defaultOpen={true}
  ariaLabel="Filter options"
>
  {/* Content */}
</CollapsibleSection>
```

**Props:**
- `title`: Section title
- `defaultOpen`: Initial state (default: true)
- `className`: Container classes
- `headerClassName`: Header classes
- `contentClassName`: Content classes
- `ariaLabel`: Accessibility label

### AsyncButton
Button component with built-in loading state.

```typescript
<AsyncButton
  onClick={handleSubmit}
  isLoading={isSubmitting}
  loadingText="Submitting..."
  variant="primary"
>
  Submit
</AsyncButton>
```

**Props:**
- `isLoading`: Loading state
- `loadingText`: Text during loading
- `variant`: 'primary' | 'secondary' | 'danger'
- `size`: 'sm' | 'md' | 'lg'
- `fullWidth`: Full width button
- All standard button props

### Modal
Accessible modal dialog component.

```typescript
<Modal
  isOpen={isOpen}
  onClose={handleClose}
  title="Confirm Action"
  size="md"
>
  {/* Modal content */}
</Modal>
```

**Props:**
- `isOpen`: Modal visibility
- `onClose`: Close handler
- `title`: Optional title
- `size`: 'sm' | 'md' | 'lg' | 'xl'
- `showCloseButton`: Show close button (default: true)

### EmptyState
Empty state component for when no data is available.

```typescript
<EmptyState
  title="No results found"
  description="Try adjusting your filters"
  action={{
    label: "Reset Filters",
    onClick: handleReset
  }}
  icon={<SearchIcon />}
/>
```

**Props:**
- `title`: Main message
- `description`: Optional description
- `icon`: Optional icon element
- `action`: Optional action button
- `className`: Additional CSS classes

## Usage Guidelines

1. **Consistency**: Use these components instead of creating one-off implementations
2. **Composition**: Combine components to create more complex UI patterns
3. **Accessibility**: All components include proper ARIA attributes
4. **Responsiveness**: Components are designed to work across screen sizes
5. **Theming**: Components use consistent color schemes and styling

## Example Integration

```typescript
import { LoadingSpinner, ErrorMessage, AsyncButton } from '../shared';
import { useAsync } from '../../hooks/common';

function MyComponent() {
  const [state, { execute }] = useAsync(fetchData);

  if (state.isLoading) {
    return <LoadingSpinner size="lg" />;
  }

  if (state.isError) {
    return <ErrorMessage error={state.error} onRetry={execute} />;
  }

  return (
    <div>
      {/* Your content */}
      <AsyncButton onClick={execute} variant="primary">
        Refresh
      </AsyncButton>
    </div>
  );
}
```