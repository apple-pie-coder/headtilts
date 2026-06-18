import { useState, useEffect } from 'react';

const VISITOR_KEY = 'ht_visitor_id';

function getOrCreateVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export function useVisitorId(): string {
  const [id, setId] = useState('');
  useEffect(() => { setId(getOrCreateVisitorId()); }, []);
  return id;
}
