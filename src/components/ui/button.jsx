import React from 'react';

export const Button = ({ children, onClick, disabled, className }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 ${className || ''}`}
    >
      {children}
    </button>
  );
};
