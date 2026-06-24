type DataRow = {
  id: string;
  [key: string]: string;
};

type Column = {
  key: string;
  label: string;
};

type AdaptiveDataViewProps = {
  ariaLabel: string;
  rows: DataRow[];
  columns: Column[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function AdaptiveDataView({ ariaLabel, rows, columns, selectedId, onSelect }: AdaptiveDataViewProps) {
  return (
    <div className="adaptive-data-view" aria-label={ariaLabel}>
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">선택</th>
            {columns.map((column) => (
              <th scope="col" key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-selected={row.id === selectedId}>
              <td>
                <button className="button compact" type="button" onClick={() => onSelect(row.id)}>
                  선택
                </button>
              </td>
              {columns.map((column) => (
                <td key={column.key}>{row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="data-cards">
        {rows.map((row) => (
          <article className="data-card" key={row.id} data-selected={row.id === selectedId}>
            {columns.map((column) => (
              <div className="card-row" key={column.key}>
                <span>{column.label}</span>
                <strong>{row[column.key]}</strong>
              </div>
            ))}
            <button className="button secondary" type="button" onClick={() => onSelect(row.id)}>
              선택
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
