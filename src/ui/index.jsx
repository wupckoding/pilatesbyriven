// Design system de Pilates by Riven: piezas base reutilizadas en todas las pantallas.
import React, { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, LoaderCircle, RotateCw } from 'lucide-react'
import { initials } from '../lib/format'

export const cx = (...parts) => parts.filter(Boolean).join(' ')

// ─── Marca ───────────────────────────────────────────────
export function Logo({ tone = 'beige', className = '', size = 'md' }) {
  const scale = { sm: ['text-[9px]', 'h-[15px]'], md: ['text-[11px]', 'h-[22px]'], lg: ['text-[13px]', 'h-[34px]'] }[size]
  return (
    <div className={cx('inline-flex flex-col items-center gap-2', className)} role="img" aria-label="Pilates by Riven">
      <span className={cx('font-semibold uppercase tracking-[0.42em] pl-[0.42em]', scale[0], tone === 'white' ? 'text-white/80' : 'text-clay-deep')}>
        Pilates by
      </span>
      <img src={tone === 'white' ? '/logo-white.svg' : '/logo-beige.svg'} alt="" className={cx('w-auto', scale[1])} />
    </div>
  )
}

/** Círculo con una palomita que se traza: para los momentos de "listo". */
export function SuccessCheck({ className = '' }) {
  return (
    <span className={cx('success-check inline-flex h-16 w-16 items-center justify-center rounded-full bg-sage-soft text-sage', className)} aria-hidden="true">
      <svg viewBox="0 0 32 32" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 16.5l5.5 5.5L24.5 10.5" pathLength="1" />
      </svg>
    </span>
  )
}

export function Spinner({ className = 'h-5 w-5' }) {
  return <LoaderCircle className={cx('animate-spin', className)} aria-hidden="true" />
}

// ─── Botones ─────────────────────────────────────────────
const BUTTON_VARIANTS = {
  primary: 'bg-ink text-surface hover:bg-espresso active:bg-espresso shadow-card',
  clay: 'bg-clay-deep text-white hover:brightness-95 shadow-card',
  secondary: 'bg-surface text-ink border border-line hover:border-clay hover:bg-clay-soft/40',
  ghost: 'text-ink-2 hover:bg-ink/5',
  danger: 'bg-terracotta-soft text-terracotta hover:brightness-95',
  whatsapp: 'bg-sage-soft text-sage hover:brightness-95',
}
const BUTTON_SIZES = {
  sm: 'h-9 px-3.5 text-[13px] gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-[52px] px-6 text-[15px] gap-2',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, block = false, icon: Icon, to, href, className = '', children, disabled, ...props }, ref,
) {
  const classes = cx(
    'inline-flex shrink-0 items-center justify-center rounded-full font-semibold transition-all duration-150',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none',
    BUTTON_VARIANTS[variant], BUTTON_SIZES[size], block && 'w-full', className,
  )
  const content = (
    <>
      {loading ? <Spinner className="h-4 w-4" /> : Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </>
  )
  if (to) return <Link ref={ref} to={to} className={classes} {...props}>{content}</Link>
  if (href) return <a ref={ref} href={href} className={classes} target="_blank" rel="noreferrer" {...props}>{content}</a>
  return <button ref={ref} type="button" className={classes} disabled={disabled || loading} {...props}>{content}</button>
})

export const IconButton = forwardRef(function IconButton({ icon: Icon, label, className = '', to, href, ...props }, ref) {
  const classes = cx(
    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors',
    'hover:bg-ink/5 active:bg-ink/10 disabled:opacity-40', className,
  )
  const icon = <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
  if (to) return <Link ref={ref} to={to} aria-label={label} title={label} className={classes} {...props}>{icon}</Link>
  if (href) return <a ref={ref} href={href} target="_blank" rel="noreferrer" aria-label={label} title={label} className={classes} {...props}>{icon}</a>
  return <button ref={ref} type="button" aria-label={label} title={label} className={classes} {...props}>{icon}</button>
})

// ─── Superficies ─────────────────────────────────────────
export function Card({ as: Tag = 'div', className = '', interactive = false, children, ...props }) {
  return (
    <Tag
      className={cx(
        'rounded-3xl border border-line bg-surface shadow-card',
        interactive && 'transition-all duration-150 hover:-translate-y-px hover:border-clay hover:shadow-lift active:translate-y-0',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  )
}

const BADGE_TONES = {
  neutral: 'bg-ink/[0.06] text-ink-2',
  clay: 'bg-clay-soft text-clay-deep',
  sage: 'bg-sage-soft text-sage',
  honey: 'bg-honey-soft text-honey',
  terracotta: 'bg-terracotta-soft text-terracotta',
  dark: 'bg-white/10 text-white/90',
}
export function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none', BADGE_TONES[tone], className)}>
      {children}
    </span>
  )
}

export function Avatar({ name, size = 'md', className = '' }) {
  const sizes = { sm: 'h-8 w-8 text-[11px]', md: 'h-10 w-10 text-[13px]', lg: 'h-14 w-14 text-lg' }
  return (
    <span aria-hidden="true" className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-clay-soft font-semibold text-clay-deep', sizes[size], className)}>
      {initials(name)}
    </span>
  )
}

// ─── Encabezados y estados ───────────────────────────────
export function PageHeader({ eyebrow, title, subtitle, actions, className = '' }) {
  return (
    <header className={cx('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="display text-[34px] text-ink sm:text-[42px]">{title}</h1>
        {subtitle && <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function SectionTitle({ children, action, className = '' }) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  )
}

/** Indicador numérico. Con `to` se vuelve un enlace al detalle que compone el total. */
export function Stat({ label, value, hint, to, tone = 'default', icon: Icon }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-clay" aria-hidden="true" />}
      </div>
      <p className={cx('display tnum mt-3 text-[40px]', tone === 'alert' ? 'text-terracotta' : 'text-ink')}>{value}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-[13px] text-ink-3">{hint}</p>
        {to && <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />}
      </div>
    </>
  )
  return to
    ? <Card as={Link} to={to} interactive className="block p-5">{body}</Card>
    : <Card className="p-5">{body}</Card>
}

export function EmptyState({ icon: Icon, title, text, action, className = '' }) {
  return (
    <div className={cx('flex flex-col items-center rounded-3xl border border-dashed border-line px-6 py-10 text-center', className)}>
      {Icon && (
        <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-clay-soft text-clay-deep">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}
      <p className="display text-2xl text-ink">{title}</p>
      {text && <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-2">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <EmptyState
      icon={RotateCw}
      title="No pudimos cargar esto"
      text={error?.message || 'Inténtalo de nuevo en un momento.'}
      action={onRetry && <Button variant="secondary" onClick={onRetry}>Reintentar</Button>}
    />
  )
}

export function Skeleton({ className = 'h-20' }) {
  return <div className={cx('animate-pulse rounded-3xl bg-sunken', className)} aria-hidden="true" />
}

export function SkeletonList({ count = 3, className = 'h-24' }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className={className} />)}
    </div>
  )
}

// ─── Formularios ─────────────────────────────────────────
export function Field({ label, hint, error, optional = false, children, className = '', htmlFor }) {
  const autoId = React.useId()
  // htmlFor: cuando el campo va envuelto (p. ej. contraseña con botón), se indica el id del input real.
  const id = htmlFor || autoId
  const child = React.isValidElement(children) && !htmlFor
    ? React.cloneElement(children, {
        id: children.props.id || id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || hint ? `${id}-help` : undefined,
      })
    : children
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor || child?.props?.id || id} className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold text-ink-2">
          <span>{label}</span>
          {optional && <span className="font-normal text-ink-3">Opcional</span>}
        </label>
      )}
      {child}
      {(error || hint) && (
        <p id={`${id}-help`} className={cx('mt-1.5 text-[13px]', error ? 'font-medium text-terracotta' : 'text-ink-3')} role={error ? 'alert' : undefined}>
          {error || hint}
        </p>
      )}
    </div>
  )
}

export const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={cx('field', props['aria-invalid'] && '!border-terracotta', className)} {...props} />
})

export const Textarea = forwardRef(function Textarea({ className = '', rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cx('field resize-none', className)} {...props} />
})

export const Select = forwardRef(function Select({ className = '', children, ...props }, ref) {
  return (
    <select
      ref={ref}
      className={cx('field appearance-none bg-[length:16px] bg-[right_1rem_center] bg-no-repeat pr-10', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23776B61' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}
      {...props}
    >
      {children}
    </select>
  )
})

/** Selector de opciones en línea (filtros, pestañas). */
export function Segmented({ options, value, onChange, className = '', label }) {
  return (
    <div role="tablist" aria-label={label} className={cx('no-scrollbar inline-flex max-w-full gap-1 overflow-x-auto rounded-full bg-sunken p-1', className)}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cx(
              'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-semibold transition-all duration-150',
              active ? 'bg-surface text-ink shadow-card' : 'text-ink-3 hover:text-ink',
            )}
          >
            {opt.label}
            {opt.count > 0 && (
              <span className={cx('tnum rounded-full px-1.5 py-0.5 text-[10px] leading-none', active ? 'bg-clay-soft text-clay-deep' : 'bg-ink/10 text-ink-2')}>
                {opt.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Ocupación "2 de 3" con un punto por cupo. */
export function Occupancy({ taken, capacity, dark = false, showLabel = true }) {
  const full = taken >= capacity
  return (
    <span className="inline-flex items-center gap-2">
      {capacity <= 8 && (
        <span className="flex gap-1" aria-hidden="true">
          {Array.from({ length: capacity }, (_, i) => (
            <span
              key={i}
              className={cx('h-2 w-2 rounded-full', i < taken
                ? (dark ? 'bg-clay' : full ? 'bg-clay-deep' : 'bg-clay')
                : (dark ? 'bg-white/20' : 'bg-ink/10'))}
            />
          ))}
        </span>
      )}
      {showLabel && (
        <span className={cx('tnum text-[13px] font-semibold', dark ? 'text-white/90' : full ? 'text-clay-deep' : 'text-ink-2')}>
          {taken} de {capacity}
        </span>
      )}
    </span>
  )
}
