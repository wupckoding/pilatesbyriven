import React from 'react'
import { motion } from 'framer-motion'
import { FiMail, FiMessageCircle, FiSearch } from 'react-icons/fi'

export default function AdminClientsTab({
  fadeUp,
  searchQuery,
  setSearchQuery,
  filteredUsers,
  allBookings,
}) {
  return (
    <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
      <div className="relative mb-4">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2" size={15} style={{ color: '#C4AFA2' }} />
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar cliente..." className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', color: '#333' }} />
      </div>

      <div className="space-y-2">
        {filteredUsers.map((item) => {
          const activeBookings = allBookings.filter((bookingItem) => bookingItem.userId === item.id && bookingItem.status !== 'cancelled')
          return (
            <div key={item.id} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-[14px] text-charcoal">{item.name} {item.surname || ''}</p>
                  <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: '#C4AFA2' }}>
                    <FiMail size={10} /> {item.email}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-[22px] text-charcoal">{activeBookings.length}</p>
                  <p className="text-[10px]" style={{ color: '#C4AFA2' }}>reservas</p>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {item.phone ? (
                  <button onClick={() => window.open(`https://wa.me/${item.phone.replace(/\D/g, '')}`, '_blank')} className="flex-1 py-2.5 rounded-2xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap" style={{ background: 'rgba(37,211,102,0.08)', color: '#25D366' }}>
                    <FiMessageCircle size={13} /> WhatsApp
                  </button>
                ) : null}
                <button onClick={() => window.open(`mailto:${item.email}`, '_blank')} className="flex-1 py-2.5 rounded-2xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap" style={{ background: 'rgba(193,156,128,0.08)', color: '#8B6B53' }}>
                  <FiMail size={13} /> Email
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
