import React from 'react'

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode
}

export const Label: React.FC<LabelProps> = ({ children, className = '', ...props }) => (
  <label {...props} className={`text-sm font-medium text-gray-300 ${className}`}>
    {children}
  </label>
)
