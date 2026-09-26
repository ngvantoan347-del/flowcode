export async function loadAll(fetcher, ids) {
  const out = {};
  for (const id of ids) out[id] = await fetcher(id);
  return out;
}