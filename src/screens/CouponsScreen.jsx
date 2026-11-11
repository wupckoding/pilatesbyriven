import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FiGift, FiPercent, FiSearch, FiTrash2 } from 'react-icons/fi'
import { bookings } from '../utils/data'
import { useLanguage } from '../i18n/LanguageContext'

const fadeUp = {
  hidden: { opacity: 0, y: 14 },
  show: (index) => ({
    opacity: 1,
    y: 0,
    transition: { delay: index * 0.05, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
  }),
}

const emptyCouponForm = {
  code: '',
  discountPercent: 10,
  isActive: true,
}

export default function CouponsScreen() {
  const { language } = useLanguage()
  const text = {
    es: { title: 'Cupones', subtitle: 'Crea y controla descuentos desde una sola pantalla', newCoupon: 'Nuevo cupón', couponDesc: 'Código + porcentaje', active: 'Cupón activo', inactive: 'Cupón inactivo', save: 'Guardar cupón', saving: 'Guardando...', search: 'Buscar cupón...', loading: 'Cargando cupones...', empty: 'Sin cupones', discount: 'Descuento', enable: 'Activar', disable: 'Desactivar', delete: 'Eliminar' },
    pt: { title: 'Cupons', subtitle: 'Crie e controle descontos em uma única tela', newCoupon: 'Novo cupom', couponDesc: 'Código + porcentagem', active: 'Cupom ativo', inactive: 'Cupom inativo', save: 'Salvar cupom', saving: 'Salvando...', search: 'Buscar cupom...', loading: 'Carregando cupons...', empty: 'Sem cupons', discount: 'Desconto', enable: 'Ativar', disable: 'Desativar', delete: 'Excluir' },
    en: { title: 'Coupons', subtitle: 'Create and manage discounts from one screen', newCoupon: 'New coupon', couponDesc: 'Code + percentage', active: 'Coupon active', inactive: 'Coupon inactive', save: 'Save coupon', saving: 'Saving...', search: 'Search coupon...', loading: 'Loading coupons...', empty: 'No coupons yet', discount: 'Discount', enable: 'Enable', disable: 'Disable', delete: 'Delete' },
  }[language]
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [coupons, setCoupons] = useState([])
  const [couponForm, setCouponForm] = useState(emptyCouponForm)

  const loadCoupons = useCallback(async () => {
    setLoading(true)
    const list = await bookings.getCoupons()
    setCoupons(list)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadCoupons()
  }, [loadCoupons])

  const filteredCoupons = useMemo(() => {
    if (!search.trim()) return coupons
    const query = search.toLowerCase()
    return coupons.filter((item) => item.code?.toLowerCase().includes(query))
  }, [coupons, search])

  const handleCreateCoupon = async (event) => {
    event.preventDefault()
    setSaving(true)
    const result = await bookings.createCoupon({
      code: couponForm.code,
      discountPercent: Number(couponForm.discountPercent),
      isActive: couponForm.isActive,
    })
    setSaving(false)
    if (result.error) {
      window.alert(result.error)
      return
    }
    setCouponForm(emptyCouponForm)
    loadCoupons()
  }

  const handleToggleCoupon = async (coupon) => {
    const result = await bookings.updateCoupon(coupon.id, { isActive: !coupon.isActive })
    if (result.error) {
      window.alert(result.error)
      return
    }
    loadCoupons()
  }

  const handleDeleteCoupon = async (couponId) => {
    const result = await bookings.deleteCoupon(couponId)
    if (result.error) {
      window.alert(result.error)
      return
    }
    loadCoupons()
  }

  return (
    <div className="screen-scroll">
      <div className="px-6 pt-5 pb-8">
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="show" className="mb-4">
          <h1 className="font-display text-[22px] font-semibold text-charcoal tracking-tight">{text.title}</h1>
          <p className="text-[13px] mt-0.5" style={{ color: '#C4AFA2' }}>
            {text.subtitle}
          </p>
        </motion.div>

        <motion.form custom={1} variants={fadeUp} initial="hidden" animate="show" onSubmit={handleCreateCoupon} className="rounded-3xl p-5 mb-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(193,156,128,0.08)' }}>
              <FiGift size={16} style={{ color: '#C19C80' }} />
            </div>
            <div>
              <p className="font-semibold text-charcoal">{text.newCoupon}</p>
              <p className="text-[11px]" style={{ color: '#C4AFA2' }}>{text.couponDesc}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              value={couponForm.code}
              onChange={(event) => setCouponForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
              placeholder="CODIGO20"
              className="input-field"
              required
            />
            <div className="relative">
              <FiPercent className="absolute left-4 top-1/2 -translate-y-1/2" size={14} style={{ color: '#C4AFA2' }} />
              <input
                type="number"
                min="1"
                max="100"
                value={couponForm.discountPercent}
                onChange={(event) => setCouponForm((current) => ({ ...current, discountPercent: event.target.value }))}
                className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none"
                style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)' }}
                required
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setCouponForm((current) => ({ ...current, isActive: !current.isActive }))}
            className="w-full py-2.5 rounded-2xl text-[11px] font-semibold tap mb-2"
            style={{ background: couponForm.isActive ? 'rgba(143,166,133,0.12)' : 'rgba(196,131,142,0.1)', color: couponForm.isActive ? '#5F7756' : '#C4838E' }}
          >
            {couponForm.isActive ? text.active : text.inactive}
          </button>

          <button type="submit" disabled={saving} className="w-full py-3 rounded-2xl text-[12px] font-semibold text-white tap disabled:opacity-60" style={{ background: '#1A1A1A' }}>
            {saving ? text.saving : text.save}
          </button>
        </motion.form>

        <motion.div custom={2} variants={fadeUp} initial="hidden" animate="show" className="relative mb-4">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2" size={15} style={{ color: '#C4AFA2' }} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} className="w-full py-3 pl-11 pr-4 rounded-xl text-[13px] outline-none" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.04)', color: '#333' }} />
        </motion.div>

        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="show" className="space-y-2">
          {loading ? (
            <div className="rounded-3xl p-5 bg-white text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="text-[12px]" style={{ color: '#C4AFA2' }}>{text.loading}</p>
            </div>
          ) : filteredCoupons.length === 0 ? (
            <div className="rounded-3xl p-5 bg-white text-center" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="font-semibold text-charcoal">{text.empty}</p>
            </div>
          ) : filteredCoupons.map((item) => (
            <div key={item.id} className="rounded-3xl p-4 bg-white" style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-[14px] text-charcoal">{item.code}</p>
                  <p className="text-[11px] mt-1" style={{ color: '#C4AFA2' }}>{text.discount}: {Number(item.discountPercent || 0)}%</p>
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full" style={{ color: item.isActive ? '#8FA685' : '#C4838E', background: item.isActive ? 'rgba(143,166,133,0.1)' : 'rgba(196,131,142,0.1)' }}>
                  {item.isActive ? text.active : text.inactive}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4">
                <button onClick={() => handleToggleCoupon(item)} className="py-2.5 rounded-2xl text-[11px] font-semibold tap" style={{ background: 'rgba(193,156,128,0.08)', color: '#8B6B53' }}>
                  {item.isActive ? text.disable : text.enable}
                </button>
                <button onClick={() => handleDeleteCoupon(item.id)} className="py-2.5 rounded-2xl text-[11px] font-semibold flex items-center justify-center gap-1.5 tap" style={{ background: 'rgba(196,131,142,0.1)', color: '#C4838E' }}>
                  <FiTrash2 size={13} /> {text.delete}
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
