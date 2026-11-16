// Ícones próprios do ONE Ticket (nunca emoji ou glifo de texto).
// Grade 24, traço 2, pontas arredondadas, cor = currentColor.
const PATHS = {
  // imagem: moldura com montanha e sol
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 17.5l4.6-4.6a1.6 1.6 0 0 1 2.3 0l1.6 1.6 2.4-2.4a1.6 1.6 0 0 1 2.3 0l3.3 3.3" />
    </>
  ),
  // remover: lixeira
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.2c0-.7.5-1.2 1.2-1.2h2.6c.7 0 1.2.5 1.2 1.2V7" />
      <path d="M6.5 7l.8 11.6a1.6 1.6 0 0 0 1.6 1.4h6.2a1.6 1.6 0 0 0 1.6-1.4L17.5 7" />
      <path d="M10.2 10.8v5.4M13.8 10.8v5.4" />
    </>
  ),
  plus: <path d="M12 5.5v13M5.5 12h13" />,
  minus: <path d="M5.5 12h13" />,
  edit: (
    <>
      <path d="M4.5 19.5l.9-3.9L15.8 5.2a1.9 1.9 0 0 1 2.7 0l.3.3a1.9 1.9 0 0 1 0 2.7L8.4 18.6z" />
      <path d="M13.6 7.4l3 3" />
    </>
  ),
  // enviado: ingresso/recibo com marca de conferido
  synced: (
    <>
      <path d="M5 4.5h14v15l-2.3-1.4-2.3 1.4-2.4-1.4-2.3 1.4L7.3 18.1 5 19.5z" />
      <path d="M8.7 11.6l2.2 2.2 4.4-4.6" />
    </>
  ),
  // na fila: relógio com ponteiro
  pending: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 8v4.3l2.8 1.8" />
    </>
  ),
  // abre o outro sistema: seta saindo de um quadro
  external: (
    <>
      <path d="M13.5 5.5h5v5" />
      <path d="M18.5 5.5l-7.5 7.5" />
      <path d="M17 13.5v4a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 17.5v-9A1.5 1.5 0 0 1 6.5 7h4" />
    </>
  ),
  // sair: porta com seta
  logout: (
    <>
      <path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10" />
      <path d="M14 8l4 4-4 4" />
      <path d="M18 12H9.5" />
    </>
  ),
  // tema: disco com metade preenchida
  contrast: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none" />
    </>
  ),
};

export default function Icon({ name, size = 20, label, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      {label && <title>{label}</title>}
      {PATHS[name]}
    </svg>
  );
}
