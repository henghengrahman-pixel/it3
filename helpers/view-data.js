import { getQuickActions, getSettings, getSlides } from "./store.js";
export async function getViewData(){
  const [settings, slides, quickActions] = await Promise.all([getSettings(), getSlides(), getQuickActions()]);
  return {
    settings,
    slides: (slides || []).filter(item=>item && item.active !== false && item.image),
    quickActions: (quickActions || []).filter(item=>item && item.active !== false)
  };
}
