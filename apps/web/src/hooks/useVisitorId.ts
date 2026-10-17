import { useState, useEffect } from 'react';
import { randomId } from '../utils/id';

const VISITOR_KEY = 'ht_visitor_id';

function getOrCreateVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = randomId();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export function useVisitorId(): string {
  const [id, setId] = useState('');
  useEffect(() => { setId(getOrCreateVisitorId()); }, []);
  return id;
}
