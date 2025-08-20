/**
 * Example usage of the Enhanced Chat Panel
 * 
 * This demonstrates how to integrate the optimized chat components
 * with virtual scrolling, lazy emoji loading, and other performance features.
 */

import React, { useState } from 'react';
import { EnhancedChatPanel } from './EnhancedChatPanel';
import { ChatMessage } from './types';

export const ChatPanelExample: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  
  // Example table ID for persistence
  const tableId = 'table-123';
  const currentUserId = 'user-456';
  
  const handleSendMessage = (message: string) => {
    // Add message to state
    const newMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      username: 'CurrentUser',
      userId: currentUserId,
      message,
      timestamp: new Date(),
      isSystem: false,
      channel: 'game'
    };
    
    setMessages(prev => [...prev, newMessage]);
    
    // In real app, send to server via WebSocket
    // ws.send(JSON.stringify({ type: 'chat', message }));
  };
  
  const handleTypingStart = () => {
    // Notify server that user started typing
    // ws.send(JSON.stringify({ type: 'typing_start' }));
  };
  
  const handleTypingStop = () => {
    // Notify server that user stopped typing
    // ws.send(JSON.stringify({ type: 'typing_stop' }));
  };
  
  // In real app, update typing users based on WebSocket messages
  // ws.on('message', (data) => {
  //   if (data.type === 'user_typing') {
  //     setTypingUsers(data.users);
  //   }
  // });
  
  return (
    <div className="h-screen bg-gray-900 p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-white text-2xl mb-4">Enhanced Chat Demo</h1>
        
        <EnhancedChatPanel
          messages={messages}
          onSendMessage={handleSendMessage}
          currentUserId={currentUserId}
          isConnected={true}
          tableId={tableId}
          onTypingStart={handleTypingStart}
          onTypingStop={handleTypingStop}
          typingUsers={typingUsers}
          className="h-[600px]"
        />
        
        <div className="mt-4 text-gray-400 text-sm">
          <h2 className="font-bold mb-2">Performance Features:</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Virtual scrolling - handles 10,000+ messages</li>
            <li>Message batching - groups rapid messages</li>
            <li>Lazy emoji loading - loads categories on demand</li>
            <li>Message caching - caches sanitized content</li>
            <li>Search functionality - filters messages in real-time</li>
            <li>Persistence - saves/loads messages per table</li>
            <li>Typing indicators - shows who's typing</li>
          </ul>
        </div>
      </div>
    </div>
  );
};