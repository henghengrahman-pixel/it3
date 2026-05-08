import { getAds, getPosts, getQuickActions, getSettings, getSlides } from "./store.js";
export async function getViewData(){
  const [settings, slides, quickActions, ads, posts] = await Promise.all([
    getSettings(), getSlides(), getQuickActions(), getAds(), getPosts()
  ]);
  return {
    settings,
    slides: slides.filter(item=>item.active),
    quickActions: quickActions.filter(item=>item.active),
    ads: ads.filter(item=>item.active),
    latestPosts: posts.slice(0, 8)
  };
}
