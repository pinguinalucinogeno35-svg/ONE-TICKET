// ONE Ticket — sistema da Bilheteria. O Bar é outro sistema, no mesmo banco.
export const APP = 'bilheteria';
export const AREA = 'Bilheteria';
export const OTHER = { label: 'Bar', url: 'https://one-ticket-bar.vercel.app' };

export const ROLE_LABEL = {
  produtor: 'Produtor', bilheteria: 'Bilheteria', portaria: 'Portaria', gerente_bar: 'Gerente do bar', caixa_bar: 'Caixa do bar',
};

// Quem entra em cada parte deste sistema
export const ACCESS = {
  painel: ['produtor', 'bilheteria'],
  portaria: ['produtor', 'bilheteria', 'portaria'],
  resultado: ['produtor'],
  equipe: ['produtor'],
  eventos: ['produtor'],
};

export const HOME = { produtor: '/painel', bilheteria: '/painel', portaria: '/portaria' };

// Abas do painel, filtradas pela função de quem entrou
export const NAV = [
  { href: '/painel/eventos', label: 'Eventos', roles: ACCESS.eventos },
  { href: '/painel', label: 'Visão geral', roles: ACCESS.painel },
  { href: '/painel/lotes', label: 'Lotes e preços', roles: ACCESS.painel },
  { href: '/painel/cupons', label: 'Cupons', roles: ACCESS.painel },
  { href: '/portaria', label: 'Portaria', roles: ACCESS.portaria },
  { href: '/resultado', label: 'Resultado da festa', roles: ACCESS.resultado },
  { href: '/painel/equipe', label: 'Equipe', roles: ACCESS.equipe },
];
// Quem vê o atalho para o outro sistema
export const OTHER_ROLES = ['produtor'];

// O que cada função faz (tela Equipe). O cadastro de equipe vale para os dois sistemas.
export const ROLE_DESC = {
  produtor: 'Tudo, nos dois sistemas. Cria eventos e acessos e vê o resultado da festa.',
  bilheteria: 'Bilheteria: visão geral, lotes, preços, cupons e portaria.',
  portaria: 'Bilheteria: só o leitor de QR da entrada.',
  gerente_bar: 'Bar: PDV, estoque, produtos, line-up e relatórios.',
  caixa_bar: 'Bar: só o PDV. Não cancela venda já enviada.',
};
export const ROLE_SYSTEM = { produtor: 'Os dois', bilheteria: 'Bilheteria', portaria: 'Bilheteria', gerente_bar: 'Bar', caixa_bar: 'Bar' };

// Links do resultado da festa a partir deste sistema
export const RESULT_LINKS = { tickets: '/painel', bar: `${OTHER.url}/painel` };

export const LOGIN_TITLE = 'Entrar na bilheteria';
