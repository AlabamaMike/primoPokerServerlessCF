import { MessageBatcher, createDebouncer } from '../message-batcher';

describe('MessageBatcher', () => {
  jest.useFakeTimers();

  afterEach(() => {
    jest.clearAllTimers();
  });

  it('should batch messages within the interval', async () => {
    const onBatch = jest.fn();
    const batcher = new MessageBatcher({
      batchInterval: 100,
      onBatch
    });

    // Add multiple messages
    batcher.add('test1', { data: 1 });
    batcher.add('test2', { data: 2 });
    batcher.add('test3', { data: 3 });

    // Should not process immediately
    expect(onBatch).not.toHaveBeenCalled();

    // Fast-forward time
    jest.advanceTimersByTime(100);

    // Should process all messages in a single batch
    expect(onBatch).toHaveBeenCalledTimes(1);
    expect(onBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'test1', payload: { data: 1 } }),
        expect.objectContaining({ type: 'test2', payload: { data: 2 } }),
        expect.objectContaining({ type: 'test3', payload: { data: 3 } })
      ])
    );
  });

  it('should deduplicate table_updated messages', async () => {
    const onBatch = jest.fn();
    const batcher = new MessageBatcher({
      batchInterval: 100,
      onBatch
    });

    // Add multiple updates for the same table
    batcher.add('table_updated', { id: 'table1', players: 5 });
    batcher.add('table_updated', { id: 'table1', players: 6 });
    batcher.add('table_updated', { id: 'table1', players: 7 });
    batcher.add('table_updated', { id: 'table2', players: 3 });

    jest.advanceTimersByTime(100);

    // Should only have the latest update for each table
    expect(onBatch).toHaveBeenCalledTimes(1);
    const batch = onBatch.mock.calls[0][0];
    
    const table1Updates = batch.filter((m: any) => 
      m.type === 'table_updated' && m.payload.id === 'table1'
    );
    const table2Updates = batch.filter((m: any) => 
      m.type === 'table_updated' && m.payload.id === 'table2'
    );

    expect(table1Updates).toHaveLength(1);
    expect(table1Updates[0].payload.players).toBe(7);
    expect(table2Updates).toHaveLength(1);
    expect(table2Updates[0].payload.players).toBe(3);
  });

  it('should process immediately when max batch size is reached', async () => {
    const onBatch = jest.fn();
    const batcher = new MessageBatcher({
      batchInterval: 1000,
      maxBatchSize: 3,
      onBatch
    });

    // Add messages up to max batch size
    batcher.add('test1', { data: 1 });
    batcher.add('test2', { data: 2 });
    expect(onBatch).not.toHaveBeenCalled();

    batcher.add('test3', { data: 3 });

    // Should process immediately without waiting
    jest.advanceTimersByTime(0);
    expect(onBatch).toHaveBeenCalledTimes(1);
  });

  it('should handle flush correctly', async () => {
    const onBatch = jest.fn();
    const batcher = new MessageBatcher({
      batchInterval: 1000,
      onBatch
    });

    batcher.add('test1', { data: 1 });
    batcher.add('test2', { data: 2 });

    // Flush should process immediately
    batcher.flush();
    jest.advanceTimersByTime(0);

    expect(onBatch).toHaveBeenCalledTimes(1);
    expect(onBatch).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ type: 'test1' }),
        expect.objectContaining({ type: 'test2' })
      ])
    );
  });

  it('should track metrics correctly', async () => {
    const onBatch = jest.fn();
    const batcher = new MessageBatcher({
      batchInterval: 100,
      onBatch
    });

    // Add messages in multiple batches
    batcher.add('test1', { data: 1 });
    batcher.add('test2', { data: 2 });
    jest.advanceTimersByTime(100);

    batcher.add('test3', { data: 3 });
    batcher.add('test4', { data: 4 });
    batcher.add('test5', { data: 5 });
    jest.advanceTimersByTime(100);

    const metrics = batcher.getMetrics();
    expect(metrics.totalMessages).toBe(5);
    expect(metrics.totalBatches).toBe(2);
    expect(metrics.averageBatchSize).toBe(2.5);
    expect(metrics.messagesDropped).toBe(0);
  });

  it('should handle errors gracefully', async () => {
    const onError = jest.fn();
    const onBatch = jest.fn().mockImplementation(() => {
      throw new Error('Batch processing error');
    });

    const batcher = new MessageBatcher({
      batchInterval: 100,
      onBatch,
      onError
    });

    batcher.add('test1', { data: 1 });
    jest.advanceTimersByTime(100);

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should clear all pending messages and metrics', async () => {
    const onBatch = jest.fn();
    const batcher = new MessageBatcher({
      batchInterval: 100,
      onBatch
    });

    batcher.add('test1', { data: 1 });
    batcher.add('test2', { data: 2 });

    batcher.clear();
    jest.advanceTimersByTime(100);

    // Should not process any messages
    expect(onBatch).not.toHaveBeenCalled();

    const metrics = batcher.getMetrics();
    expect(metrics.totalMessages).toBe(0);
    expect(metrics.totalBatches).toBe(0);
  });
});

describe('createDebouncer', () => {
  jest.useFakeTimers();

  it('should debounce function calls', () => {
    const fn = jest.fn();
    const debounced = createDebouncer(fn, 100);

    debounced('call1');
    debounced('call2');
    debounced('call3');

    expect(fn).not.toHaveBeenCalled();

    jest.advanceTimersByTime(100);

    // Should only call once with the last arguments
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('call3');
  });

  it('should cancel pending calls', () => {
    const fn = jest.fn();
    const debounced = createDebouncer(fn, 100);

    debounced('call1');
    debounced.cancel();

    jest.advanceTimersByTime(100);

    expect(fn).not.toHaveBeenCalled();
  });

  it('should handle multiple debounce cycles', () => {
    const fn = jest.fn();
    const debounced = createDebouncer(fn, 100);

    // First cycle
    debounced('call1');
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('call1');

    // Second cycle
    debounced('call2');
    jest.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenCalledWith('call2');
  });
});