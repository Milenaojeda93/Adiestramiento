import { Check } from 'lucide-react';
import { PawIcon } from '@/components/logo';

const points = [
  'Evolución por habilidad desde la evaluación inicial',
  'Paquetes de sesiones que se descuentan solos al registrar',
  'Portal para que cada propietario siga a su mascota',
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap">
      <section className="hidden flex-[1_1_480px] flex-col justify-between lg:flex gap-10 bg-brand-dark px-8 py-10 text-white sm:px-14 sm:py-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-brand">
            <PawIcon size={22} />
          </div>
          <span className="text-xl font-bold">Adiestra</span>
        </div>
        <div className="flex max-w-[520px] flex-col gap-5">
          <p className="text-3xl font-bold leading-tight tracking-tight sm:text-[40px]">Cada sesión cuenta. Cada avance queda registrado.</p>
          <p className="text-[17px] leading-relaxed text-[#d5e6dc]">
            Agenda, seguimiento conductual, paquetes y cobros de tu centro de adiestramiento en un solo lugar.
          </p>
          <ul className="mt-2 flex flex-col gap-3">
            {points.map((p) => (
              <li key={p} className="flex items-center gap-3 text-[15px]">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#3e7f60]">
                  <Check size={14} strokeWidth={3} aria-hidden />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <span className="text-[13px] text-[#a9c8b6]">Hecho en Paraguay · Precios en guaraníes</span>
      </section>
      <section className="flex flex-[1_1_480px] flex-col items-center justify-center gap-8 px-6 py-10">
        {/* En el celular el formulario va primero: la marca se reduce al logo. */}
        <div className="flex w-full max-w-[420px] items-center gap-2.5 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-brand text-white">
            <PawIcon />
          </div>
          <span className="text-lg font-bold">Adiestra</span>
        </div>
        {children}
      </section>
    </div>
  );
}
