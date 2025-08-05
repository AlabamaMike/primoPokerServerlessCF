import React, { useEffect, useState } from 'react';

export interface WaitlistNotificationData {
  id: string;
  type: 'position_update' | 'ready_to_join' | 'table_full';
  tableName: string;
  position?: number;
  message: string;
}

interface WaitlistNotificationProps {
  notification: WaitlistNotificationData | null;
  onDismiss: () => void;
  onJoinTable?: (tableId: string) => void;
}

const WaitlistNotification: React.FC<WaitlistNotificationProps> = ({ 
  notification, 
  onDismiss,
  onJoinTable 
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (notification) {
      setIsVisible(true);
      
      // Auto-dismiss after 5 seconds for non-critical notifications
      if (notification.type !== 'ready_to_join') {
        const timer = setTimeout(() => {
          handleDismiss();
        }, 5000);
        return () => clearTimeout(timer);
      }
    } else {
      setIsVisible(false);
    }
  }, [notification]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300); // Wait for animation
  };

  if (!notification) return null;

  const getNotificationStyle = () => {
    switch (notification.type) {
      case 'ready_to_join':
        return 'bg-emerald-600 border-emerald-500';
      case 'position_update':
        return 'bg-amber-600 border-amber-500';
      case 'table_full':
        return 'bg-red-600 border-red-500';
      default:
        return 'bg-slate-700 border-slate-600';
    }
  };

  const getIcon = () => {
    switch (notification.type) {
      case 'ready_to_join':
        return '🎉';
      case 'position_update':
        return '📍';
      case 'table_full':
        return '❌';
      default:
        return '📢';
    }
  };

  return (
    <div className={`fixed top-20 right-4 z-50 transition-all duration-300 ${
      isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    }`}>
      <div className={`${getNotificationStyle()} rounded-lg shadow-2xl border-l-4 p-4 max-w-sm`}>
        <div className="flex items-start space-x-3">
          <span className="text-2xl">{getIcon()}</span>
          <div className="flex-1">
            <h4 className="font-semibold text-white mb-1">{notification.tableName}</h4>
            <p className="text-sm text-white/90">{notification.message}</p>
            
            {notification.type === 'ready_to_join' && onJoinTable && (
              <div className="mt-3 flex space-x-2">
                <button
                  onClick={() => {
                    onJoinTable(notification.id);
                    handleDismiss();
                  }}
                  className="px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded font-medium text-sm transition-colors"
                >
                  Join Now
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-1.5 bg-black/20 hover:bg-black/30 text-white rounded font-medium text-sm transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
          
          {notification.type !== 'ready_to_join' && (
            <button
              onClick={handleDismiss}
              className="text-white/60 hover:text-white transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Notification Manager Component
export const WaitlistNotificationManager: React.FC<{ onJoinTable?: (tableId: string) => void }> = ({ onJoinTable }) => {
  const [notifications, setNotifications] = useState<WaitlistNotificationData[]>([]);
  const [currentNotification, setCurrentNotification] = useState<WaitlistNotificationData | null>(null);

  // Simulate notifications for demo
  useEffect(() => {
    const demoNotifications = [
      {
        id: 'table-456',
        type: 'position_update' as const,
        tableName: 'Sakura Lounge',
        position: 2,
        message: 'You moved up to position #2'
      },
      {
        id: 'table-456',
        type: 'ready_to_join' as const,
        tableName: 'Sakura Lounge',
        message: 'A seat is now available!'
      }
    ];

    // Show demo notifications with delay
    const timer1 = setTimeout(() => {
      addNotification(demoNotifications[0]);
    }, 3000);

    const timer2 = setTimeout(() => {
      addNotification(demoNotifications[1]);
    }, 8000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
    };
  }, []);

  const addNotification = (notification: WaitlistNotificationData) => {
    setNotifications(prev => [...prev, notification]);
    
    // If no current notification, show this one
    if (!currentNotification) {
      setCurrentNotification(notification);
    }
  };

  const handleDismiss = () => {
    setCurrentNotification(null);
    
    // Show next notification if any
    setTimeout(() => {
      const remaining = notifications.filter(n => n.id !== currentNotification?.id);
      if (remaining.length > 0) {
        setCurrentNotification(remaining[0]);
        setNotifications(remaining.slice(1));
      }
    }, 100);
  };

  return (
    <WaitlistNotification
      notification={currentNotification}
      onDismiss={handleDismiss}
      onJoinTable={onJoinTable}
    />
  );
};

export default WaitlistNotification;