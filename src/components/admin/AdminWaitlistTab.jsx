import React from 'react'
import { motion } from 'framer-motion'
import { FiMessageCircle, FiSearch } from 'react-icons/fi'
import { schedule } from '../../utils/data'
import { classTypeLabels } from './shared'

export default function AdminWaitlistTab({
  fadeUp,
  waitlist,
  reminders,
  reminderConfig,
  runningReminders,
  handlePromoteWaitlist,
  handleCancelWaitlist,
  handleRunRemindersNow,
}) {
  return (
    <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
      <div className="rounded-3xl p-4 bg-white mb-4" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p className="section-label mb-2">Lista de espera activa</p>
        <div className="space-y-2">
          {waitlist.length === 0 ? (
            <p className="text-[12px]" style={{ color: '#C4AFA2' }}>Sin clientes en espera.</p>
          ) : waitlist.map((item) => (
            <div key={item.id} className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.02)' }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-[13px] text-charcoal">{item.userName}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: '#C4AFA2' }}>
                    {classTypeLabels[item.classType]} · {new Date(item.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} · {schedule.formatTimeLabel(item.time)}
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ color: '#875D4A', background: 'rgba(135,93,74,0.12)' }}>
                  En cola
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <button onClick={() => handlePromoteWaitlist(item.id)} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(143,166,133,0.1)', color: '#5F7756' }}>
                  Promover a reserva
                </button>
                <button onClick={() => handleCancelWaitlist(item.id)} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                  Quitar de cola
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p className="section-label mb-2">Recordatorios pendientes</p>
        <div className="rounded-2xl p-3 mb-3" style={{ background: 'rgba(0,0,0,0.03)' }}>
          <p className="text-[11px]" style={{ color: '#666' }}>
            Auto envio: <strong>{reminderConfig.autoEnabled ? 'Activo' : 'Inactivo'}</strong> · Proveedor: <strong>{reminderConfig.providerReady ? 'Conectado' : 'Sin credenciales'}</strong>
          </p>
          <button
            onClick={handleRunRemindersNow}
            disabled={runningReminders}
            className="mt-2 w-full py-2.5 rounded-2xl text-[11px] font-semibold tap disabled:opacity-60"
            style={{ background: 'rgba(193,156,128,0.12)', color: '#8B6B53' }}
          >
            {runningReminders ? 'Enviando...' : 'Ejecutar envio automatico ahora'}
          </button>
        </div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {reminders.length === 0 ? (
            <p className="text-[12px]" style={{ color: '#C4AFA2' }}>Sin recordatorios por ahora.</p>
          ) : reminders.slice(0, 20).map((item) => (
            <div key={item.id} className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.02)' }}>
              <p className="text-[12px] font-semibold text-charcoal">{item.userName}</p>
              <p className="text-[11px]" style={{ color: '#C4AFA2' }}>
                {new Date(item.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })} · {schedule.formatTimeLabel(item.time)}
              </p>
              {item.userPhone ? (
                <button onClick={() => window.open(`https://wa.me/${item.userPhone.replace(/\D/g, '')}`, '_blank')} className="mt-2 w-full py-2 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(37,211,102,0.08)', color: '#25D366' }}>
                  <FiMessageCircle size={13} className="inline mr-1" /> Enviar WhatsApp
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
