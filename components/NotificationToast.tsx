import React from 'react';

export const NotificationToast: React.FC<{ title: string; message: string; onClick?: () => void }> = ({ title, message, onClick }) => {
  return (
    <div onClick={onClick} className="max-w-sm w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 cursor-pointer">
      <div className="font-semibold text-sm text-gray-900 dark:text-white">{title}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{message}</div>
    </div>
  );
};
