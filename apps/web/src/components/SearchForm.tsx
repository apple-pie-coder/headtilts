import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

export function SearchForm() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [value, setValue] = useState(searchParams.get('search') || '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSearchParams(value ? { search: value } : {});
  }

  return (
    <form onSubmit={handleSubmit} className="search-form">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search posts…"
        className="search-input"
      />
      <button type="submit" className="search-btn">Search</button>
    </form>
  );
}
