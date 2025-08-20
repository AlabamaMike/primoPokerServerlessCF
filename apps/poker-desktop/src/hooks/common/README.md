# Common Hooks Library

This directory contains reusable React hooks that help reduce code duplication and promote consistent patterns across the application.

## Available Hooks

### useToggle
A simple hook for managing boolean state with helper functions.

```typescript
const [isOpen, { toggle, setTrue, setFalse, setState }] = useToggle(false);
```

**Usage Example:**
- Modal open/close states
- Collapsible sections
- Show/hide UI elements

### useAsync
Manages async operations with loading, error, and success states.

```typescript
const [state, { execute, reset, setData, setError }] = useAsync(asyncFunction);

// state contains:
// - data: T | null
// - error: Error | null
// - isLoading: boolean
// - isError: boolean
// - isSuccess: boolean
// - isIdle: boolean
```

**Usage Example:**
- API calls
- Form submissions
- Any async operations that need state management

### useIntersectionObserver
Observes element visibility using the Intersection Observer API.

```typescript
const [ref, isVisible] = useIntersectionObserver({
  threshold: 0.1,
  rootMargin: '50px',
  freezeOnceVisible: true
});
```

**Usage Example:**
- Lazy loading components
- Infinite scroll implementations
- Animation triggers on scroll

### useContainerSize
Tracks container element dimensions with ResizeObserver.

```typescript
const { containerRef, width, height } = useContainerSize();
```

**Usage Example:**
- Responsive layouts
- Dynamic sizing for virtualized lists
- Canvas/chart dimensions

### useDebounce (existing)
Debounces a value or callback function.

```typescript
// Debounce a value
const debouncedSearchTerm = useDebounce(searchTerm, 300);

// Debounce a callback
const debouncedSearch = useDebouncedCallback(searchFunction, 300);
```

**Usage Example:**
- Search input fields
- Form auto-save
- Resize handlers

## Best Practices

1. **Keep hooks focused**: Each hook should have a single, clear purpose
2. **Use TypeScript**: All hooks are fully typed for better developer experience
3. **Handle cleanup**: Hooks that use effects should clean up properly
4. **Document usage**: Include JSDoc comments for complex hooks
5. **Test thoroughly**: Write tests for all hooks to ensure reliability