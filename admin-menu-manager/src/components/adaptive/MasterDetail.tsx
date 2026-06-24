import type { ReactNode } from "react";

type MasterDetailProps = {
  master: ReactNode;
  detail: ReactNode;
};

export function MasterDetail({ master, detail }: MasterDetailProps) {
  return (
    <div className="master-detail">
      <section className="master-pane">{master}</section>
      <section className="detail-pane">{detail}</section>
    </div>
  );
}
