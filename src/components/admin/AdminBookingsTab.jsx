import React from 'react'
import { motion } from 'framer-motion'
import { FiCheck, FiMessageCircle, FiPhone, FiSearch } from 'react-icons/fi'
import { schedule, statusConfig } from '../../utils/data'
import { classTypeLabels, currency } from './shared'

export default function AdminBookingsTab({
  fadeUp,
  searchQuery,
  setSearchQuery,
  filter,
  setFilter,
  allBookings,
  stats,
  pendingBookings,
  filteredBookings,
  handleApproveAll,
  handleBookingAction,
}) {
  return (
    <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
      <div className="relative mb-4">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2" size={15} style={{ color: '#C4AFA2' }} />
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar reservas..." className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', color: '#333' }} />
      </div>

      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {[
          { id: 'all', label: 'Todas', count: allBookings.length, color: '#1A1A1A' },
          { id: 'pending', label: 'Pendientes', count: stats.pending, color: '#C19C80' },
          { id: 'approved', label: 'Aprobadas', count: stats.approved, color: '#8FA685' },
          { id: 'completed', label: 'Completadas', count: stats.completed, color: '#666' },
          { id: 'cancelled', label: 'Canceladas', count: stats.cancelled, color: '#C4838E' },
        ].map((item) => (
          <button key={item.id} onClick={() => setFilter(item.id)} className={`flex-shrink-0 px-3.5 py-2 rounded-xl text-[11px] font-semibold transition-all ${filter === item.id ? 'text-white shadow-sm' : 'text-charcoal/35'}`} style={{ background: filter === item.id ? item.color : 'rgba(0,0,0,0.03)' }}>
            {item.label} {item.count > 0 ? `(${item.count})` : ''}
          </button>
        ))}
      </div>

      {pendingBookings.length > 1 && (filter === 'pending' || filter === 'all') && (
        <button onClick={handleApproveAll} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-[12px] font-semibold mb-4 tap" style={{ background: 'rgba(143,166,133,0.08)', color: '#8FA685' }}>
          <FiCheck size={14} /> Aprobar todas ({pendingBookings.length})
        </button>
      )}

      <div className="space-y-2">
        {filteredBookings.map((item) => {
          const status = statusConfig[item.status]
          return (
            <div key={item.id} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[14px] text-charcoal">{item.userName}</p>
                  <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>
                    {classTypeLabels[item.classType]} · {new Date(item.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} · {schedule.formatTimeLabel(item.time)}
                  </p>
                  <p className="text-[11px] mt-1" style={{ color: '#8FA685' }}>Valor: {currency(item.priceAtBooking)}</p>
                  {item.userPhone ? (
                    <p className="text-[10px] mt-1 flex items-center gap-1" style={{ color: '#999' }}>
                      <FiPhone size={9} /> {item.userPhone}
                    </p>
                  ) : null}
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color: item.isNoShow ? '#875D4A' : status.color, background: item.isNoShow ? 'rgba(135,93,74,0.1)' : status.bg }}>
                  {item.isNoShow ? 'No show' : status.label}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                {item.userPhone ? (
                  <button onClick={() => window.open(`https://wa.me/${item.userPhone.replace(/\D/g, '')}`, '_blank')} className="py-2.5 rounded-2xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap" style={{ background: 'rgba(37,211,102,0.08)', color: '#25D366' }}>
                    <FiMessageCircle size={13} /> WhatsApp
                  </button>
                ) : <div />}
                {item.status === 'pending' ? (
                  <button onClick={() => handleBookingAction(item.id, 'approved')} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(143,166,133,0.1)', color: '#8FA685' }}>
                    Aprobar
                  </button>
                ) : item.status === 'approved' ? (
                  <button onClick={() => handleBookingAction(item.id, 'completed')} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(143,166,133,0.1)', color: '#8FA685' }}>
                    Completar
                  </button>
                ) : (
                  <div />
                )}
                <button onClick={() => handleBookingAction(item.id, 'no-show')} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(135,93,74,0.12)', color: '#875D4A' }}>
                  No show
                </button>
                <button onClick={() => handleBookingAction(item.id, 'cancelled')} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
