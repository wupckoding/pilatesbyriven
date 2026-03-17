import React from 'react'
import { motion } from 'framer-motion'
import { FiDollarSign, FiEdit2, FiPlus, FiSearch, FiTrash2, FiUsers } from 'react-icons/fi'
import { schedule } from '../../utils/data'
import { classTypeLabels, weekDays, currency } from './shared'

export default function AdminSchedulesTab({
  fadeUp,
  handleScheduleSubmit,
  scheduleEditingId,
  cancelEditSchedule,
  scheduleForm,
  setScheduleForm,
  scheduleMode,
  setScheduleMode,
  savingSchedule,
  handleCreateBlock,
  blockForm,
  setBlockForm,
  savingBlock,
  blocks,
  handleDeleteBlock,
  searchQuery,
  setSearchQuery,
  filteredSchedules,
  startEditSchedule,
  toggleScheduleActive,
  handleDeleteSchedule,
}) {
  return (
    <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show">
      <form onSubmit={handleScheduleSubmit} className="rounded-3xl p-5 mb-5 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(193,156,128,0.08)' }}>
              {scheduleEditingId ? <FiEdit2 size={16} style={{ color: '#C19C80' }} /> : <FiPlus size={16} style={{ color: '#C19C80' }} />}
            </div>
            <div>
              <p className="font-semibold text-charcoal">{scheduleEditingId ? 'Editar horario' : 'Nuevo horario'}</p>
              <p className="text-[11px]" style={{ color: '#C4AFA2' }}>Fecha especifica o repeticion semanal</p>
            </div>
          </div>
          {scheduleEditingId ? (
            <button type="button" onClick={cancelEditSchedule} className="text-[11px] font-semibold" style={{ color: '#C4838E' }}>
              Cancelar edicion
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <select
            value={scheduleForm.classType}
            onChange={(event) => {
              const nextType = event.target.value
              const classData = schedule.getClassType(nextType)
              setScheduleForm((current) => ({
                ...current,
                classType: nextType,
                maxSpots: classData?.maxSpots || current.maxSpots,
                price: classData?.price || current.price,
              }))
            }}
            className="input-field"
          >
            {schedule.classTypes.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
          <input type="time" value={scheduleForm.time} onChange={(event) => setScheduleForm((current) => ({ ...current, time: event.target.value }))} className="input-field" />
        </div>

        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setScheduleMode('date')} className="flex-1 py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: scheduleMode === 'date' ? '#1A1A1A' : 'rgba(0,0,0,0.03)', color: scheduleMode === 'date' ? '#fff' : '#444' }}>
            Fecha especifica
          </button>
          <button type="button" onClick={() => setScheduleMode('weekly')} className="flex-1 py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: scheduleMode === 'weekly' ? '#1A1A1A' : 'rgba(0,0,0,0.03)', color: scheduleMode === 'weekly' ? '#fff' : '#444' }}>
            Repetir semanal
          </button>
        </div>

        {scheduleMode === 'date' ? (
          <input type="date" value={scheduleForm.specificDate} onChange={(event) => setScheduleForm((current) => ({ ...current, specificDate: event.target.value }))} className="input-field mb-3" required />
        ) : (
          <select value={scheduleForm.dayOfWeek} onChange={(event) => setScheduleForm((current) => ({ ...current, dayOfWeek: Number(event.target.value) }))} className="input-field mb-3">
            {weekDays.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        )}

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="relative">
            <FiUsers className="absolute left-4 top-1/2 -translate-y-1/2" size={14} style={{ color: '#C4AFA2' }} />
            <input type="number" min="1" value={scheduleForm.maxSpots} onChange={(event) => setScheduleForm((current) => ({ ...current, maxSpots: event.target.value }))} className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)' }} />
          </div>
          <div className="relative">
            <FiDollarSign className="absolute left-4 top-1/2 -translate-y-1/2" size={14} style={{ color: '#C4AFA2' }} />
            <input type="number" min="0" step="0.01" value={scheduleForm.price} onChange={(event) => setScheduleForm((current) => ({ ...current, price: event.target.value }))} className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)' }} />
          </div>
        </div>

        <button type="submit" disabled={savingSchedule} className="w-full py-3.5 rounded-2xl text-[13px] font-semibold text-white tap disabled:opacity-60" style={{ background: '#1A1A1A' }}>
          {savingSchedule ? 'Guardando...' : scheduleEditingId ? 'Actualizar horario' : 'Guardar horario'}
        </button>
      </form>

      <form onSubmit={handleCreateBlock} className="rounded-3xl p-4 mb-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <p className="section-label mb-3">Bloqueos y excepciones</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <input type="date" value={blockForm.date} onChange={(event) => setBlockForm((current) => ({ ...current, date: event.target.value }))} className="input-field" required />
          <input type="time" value={blockForm.time} onChange={(event) => setBlockForm((current) => ({ ...current, time: event.target.value }))} className="input-field" />
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={blockForm.classType} onChange={(event) => setBlockForm((current) => ({ ...current, classType: event.target.value }))} className="input-field">
            <option value="all">Todas las clases</option>
            {Object.entries(classTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input placeholder="Razon" value={blockForm.reason} onChange={(event) => setBlockForm((current) => ({ ...current, reason: event.target.value }))} className="input-field" />
        </div>
        <button type="submit" disabled={savingBlock} className="w-full py-2.5 rounded-2xl text-[12px] font-semibold tap" style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
          {savingBlock ? 'Guardando...' : 'Crear bloqueo'}
        </button>

        <div className="space-y-2 mt-3">
          {blocks.map((blockItem) => (
            <div key={blockItem.id} className="rounded-2xl p-3" style={{ background: 'rgba(0,0,0,0.02)' }}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] font-semibold text-charcoal">
                  {new Date(blockItem.date + 'T12:00:00').toLocaleDateString('es-CR', { day: 'numeric', month: 'short' })}
                  {blockItem.time ? ` · ${schedule.formatTimeLabel(blockItem.time)}` : ' · Dia completo'}
                </p>
                <button type="button" onClick={() => handleDeleteBlock(blockItem.id)} className="text-[11px] font-semibold" style={{ color: '#C4838E' }}>
                  Eliminar
                </button>
              </div>
              <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>{blockItem.reason || 'Sin motivo'}</p>
            </div>
          ))}
        </div>
      </form>

      <div className="relative mb-4">
        <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2" size={15} style={{ color: '#C4AFA2' }} />
        <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Buscar horarios..." className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', color: '#333' }} />
      </div>

      <div className="space-y-2">
        {filteredSchedules.map((item) => {
          const dayLabel = item.specificDate
            ? new Date(item.specificDate + 'T12:00:00').toLocaleDateString('es-CR', { weekday: 'long', day: 'numeric', month: 'short' })
            : weekDays.find((day) => day.value === item.dayOfWeek)?.label
          return (
            <div key={item.id} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[14px] text-charcoal">{classTypeLabels[item.classType]}</p>
                  <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>{dayLabel} · {schedule.formatTimeLabel(item.time)}</p>
                  <p className="text-[11px] mt-1" style={{ color: '#666' }}>{item.maxSpots} cupos · {currency(item.price)}</p>
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color: item.isActive ? '#8FA685' : '#C4838E', background: item.isActive ? 'rgba(143,166,133,0.1)' : 'rgba(196,131,142,0.1)' }}>
                  {item.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4">
                <button onClick={() => startEditSchedule(item)} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(0,0,0,0.04)', color: '#444' }}>
                  Editar
                </button>
                <button onClick={() => toggleScheduleActive(item)} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(193,156,128,0.08)', color: '#8B6B53' }}>
                  {item.isActive ? 'Desactivar' : 'Activar'}
                </button>
                <button onClick={() => handleDeleteSchedule(item.id)} className="py-2.5 rounded-2xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap" style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                  <FiTrash2 size={13} /> Eliminar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}
