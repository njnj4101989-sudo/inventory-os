const COLORS = {
  // Generic
  active:       'bg-green-100 text-green-700',
  inactive:     'bg-gray-100 text-gray-600',

  // Batch statuses (uppercase)
  CREATED:      'bg-gray-100 text-gray-700',
  ASSIGNED:     'bg-blue-100 text-blue-700',
  IN_PROGRESS:  'bg-yellow-100 text-yellow-700',
  SUBMITTED:    'bg-purple-100 text-purple-700',
  CHECKED:      'bg-emerald-100 text-emerald-700',
  PACKING:      'bg-orange-100 text-orange-700',
  PACKED:       'bg-green-100 text-green-700',

  // Batch statuses (lowercase)
  created:      'bg-gray-100 text-gray-700',
  assigned:     'bg-blue-100 text-blue-700',
  in_progress:  'bg-yellow-100 text-yellow-700',
  submitted:    'bg-purple-100 text-purple-700',
  checked:      'bg-emerald-100 text-emerald-700',
  packing:      'bg-orange-100 text-orange-700',
  packed:       'bg-green-100 text-green-700',

  // Order statuses
  pending:            'bg-yellow-100 text-yellow-700',
  processing:         'bg-blue-100 text-blue-700',
  partially_shipped:  'bg-amber-100 text-amber-700',
  shipped:            'bg-green-100 text-green-700',
  delivered:    'bg-green-100 text-green-700',
  cancelled:          'bg-red-100 text-red-700',
  partially_returned: 'bg-orange-100 text-orange-700',
  returned:           'bg-orange-100 text-orange-700',

  // Return note statuses
  draft:              'bg-gray-100 text-gray-700',
  approved:           'bg-blue-100 text-blue-700',
  dispatched:         'bg-orange-100 text-orange-700',
  acknowledged:       'bg-teal-100 text-teal-700',
  closed:             'bg-green-100 text-green-700',

  // Invoice statuses
  issued:       'bg-yellow-100 text-yellow-700',
  paid:         'bg-green-100 text-green-700',
  overdue:      'bg-red-100 text-red-700',

  // Roll statuses
  in_stock:             'bg-green-100 text-green-700',
  sent_for_processing:  'bg-orange-100 text-orange-700',
  in_cutting:           'bg-blue-100 text-blue-700',
  remnant:              'bg-amber-100 text-amber-700',

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
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 typo-badge capitalize ${colorClass}`}
    >
      {display}
    </span>
  )
}
