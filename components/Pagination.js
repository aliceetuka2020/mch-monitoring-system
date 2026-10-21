"use client";

export default function Pagination({ page, totalPages, onChange }) {
  if (!totalPages || totalPages <= 1) return null;
  return <div className="pagination"><button className="btn btn-sm" type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}>Previous</button><span>Page {page} of {totalPages}</span><button className="btn btn-sm" type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages}>Next</button></div>;
}
