/// <reference types="vite/client" />

declare module 'virtual:fa-catalog' {
  interface RawIcon { name: string; style: 'solid' | 'brands'; terms: string; w: number; h: number; d: string }
  export const SOLID: RawIcon[];
  export const BRANDS: RawIcon[];
}
