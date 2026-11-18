import { ThemeId, WickTheme } from '../types/wick';

export const WICK_THEMES: Record<ThemeId, WickTheme> = {
  obsidian_night: {
    id: 'obsidian_night',
    name: 'Obsidian Night',
    isPro: false,
    canvasTop: '#0A0A0C',
    canvasBottom: '#040405',
    ambientGlow: '#FF8C24',
    primaryText: '#F5F5F7',
    accent: '#FF9F43',
  },
  midnight_hearth: {
    id: 'midnight_hearth',
    name: 'Midnight Hearth',
    isPro: true,
    canvasTop: '#140E0C',
    canvasBottom: '#080504',
    ambientGlow: '#FF6B1A',
    primaryText: '#FAF3EE',
    accent: '#FF7A33',
  },
  velvet_espresso: {
    id: 'velvet_espresso',
    name: 'Velvet Espresso',
    isPro: true,
    canvasTop: '#16110F',
    canvasBottom: '#0B0807',
    ambientGlow: '#FFB347',
    primaryText: '#F2E9E4',
    accent: '#E09F3E',
  },
  deep_forest: {
    id: 'deep_forest',
    name: 'Deep Forest',
    isPro: true,
    canvasTop: '#0A120E',
    canvasBottom: '#040806',
    ambientGlow: '#FFA94D',
    primaryText: '#E8F1EC',
    accent: '#74C69D',
  },
  lunar_slate: {
    id: 'lunar_slate',
    name: 'Lunar Slate',
    isPro: true,
    canvasTop: '#0D131D',
    canvasBottom: '#06090E',
    ambientGlow: '#90E0EF',
    primaryText: '#EDF2F4',
    accent: '#7CC6FE',
  },
  plum_dusk: {
    id: 'plum_dusk',
    name: 'Plum Dusk',
    isPro: true,
    canvasTop: '#130C18',
    canvasBottom: '#08050B',
    ambientGlow: '#FF9E64',
    primaryText: '#F4ECF7',
    accent: '#C77DFF',
  },
};

export const THEME_LIST: WickTheme[] = Object.values(WICK_THEMES);

export function getThemeById(id: ThemeId): WickTheme {
  return WICK_THEMES[id];
}
