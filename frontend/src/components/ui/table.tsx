import React from 'react'

export const Table: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`overflow-x-auto ${className}`}>
    <table className="w-full text-sm text-left">{children}</table>
  </div>
)

export const TableHead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <thead className="text-xs text-gray-400 uppercase bg-gray-800/50 border-b border-gray-800">{children}</thead>
)

export const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <tbody className="divide-y divide-gray-800/50">{children}</tbody>
)

export const TableRow: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void }> = ({ children, className = '', onClick }) => (
  <tr
    onClick={onClick}
    className={`text-gray-300 hover:bg-gray-800/50 transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
  >
    {children}
  </tr>
)

export const TableHeader: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <th className={`px-4 py-3 font-medium ${className}`}>{children}</th>
)

export const TableCell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <td className={`px-4 py-3 ${className}`}>{children}</td>
)
