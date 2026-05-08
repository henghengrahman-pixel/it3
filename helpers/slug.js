export function slugify(value = ""){
  return String(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " dan ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || `post-${Date.now()}`;
}

export function makeExcerpt(value = "", limit = 170){
  const clean = String(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit).trim()}...`;
}
