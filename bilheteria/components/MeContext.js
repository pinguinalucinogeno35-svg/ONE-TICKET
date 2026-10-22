'use client';
import { createContext, useContext } from 'react';

// Sessão de quem está usando o painel (id, nome, função). Vem do servidor, já conferida.
const Ctx = createContext(null);
export function MeProvider({ me, children }) { return <Ctx.Provider value={me}>{children}</Ctx.Provider>; }
export const useMe = () => useContext(Ctx);
