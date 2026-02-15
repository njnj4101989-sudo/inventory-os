const COLORS = {
  // Generic
  active:       'bg-green-100 text-green-700',
  inactive:     'bg-gray-100 text-gray-600',

  // Batch statuses
  CREATED:      'bg-gray-100 text-gray-700',
  ASSIGNED:     'bg-blue-100 text-blue-700',
  IN_PROGRESS:  'bg-yellow-100 text-yellow-700',
  SUBMITTED:    'bg-purple-100 text-purple-700',
  COMPLETED:    'bg-green-100 text-green-700',

  // Order statuses
  pending:      'bg-yellow-100 text-yellow-700',
  processing:   'bg-blue-100 text-blue-700',
  shipped:      'bg-green-100 text-green-700',
  delivered:    'bg-green-100 text-green-700',
  cancelled:    'bg-red-100 text-red-700',
  returned:     'bg-orange-100 text-orange-700',

  // Invoice statuses
  issued:       'bg-yellow-100 text-yellow-700',
  paid:         'bg-green-100 text-green-700',
  overdue:      'bg-red-100 text-red-700',

  // Roll statuses
  in_stock:             'bg-green-100 text-green-700',
  sent_for_processing:  'bg-orange-100 text-orange-700',
  in_cutting:           'bg-blue-100 text-blue-700',

  // Processing log statuses
  sent:     'bg-orange-100 text-orange-700',
  received: 'bg-green-100 text-green-700',
}

/**
 * Color-coded status badge.
 *
 * Props:
 *  status — string key (e.g. 'active', 'COMPLETED', 'pending')
 *  label  — override display text (defaults to status)
 */
export default function StatusBadge({ status, label }) {
  const colorClass = COLORS[status] || 'bg-gray-100 text-gray-600'
  const display = label || status

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${colorClass}`}
    >
      {display}
    </span>
  )
}
