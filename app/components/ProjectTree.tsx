'use client';
import { useEffect, useState } from 'react';

type Node = { name: string; type: 'dir' | 'file'; children?: Node[] };

export default function ProjectTree({ slug }: { slug: string }) {
  const [tree, setTree] = useState<Node[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${slug}/tree`).then(r => r.json()).then(d => setTree(d.tree ?? []));
  }, [slug]);

  return <TreeView nodes={tree} slug={slug} prefix="" />;
}

function TreeView({ nodes, slug, prefix }: { nodes: Node[]; slug: string; prefix: string }) {
  return (
    <ul className="ml-3 space-y-0.5">
      {nodes.map(n => {
        const fullPath = prefix ? `${prefix}/${n.name}` : n.name;
        return (
          <li key={fullPath} className="text-sm">
            {n.type === 'dir' ? (
              <>
                <span className="text-neutral-500">{n.name}</span>
                {n.children && <TreeView nodes={n.children} slug={slug} prefix={fullPath} />}
              </>
            ) : (
              <a
                href={`/p/${slug}?file=${encodeURIComponent(fullPath)}`}
                className="text-neutral-300 hover:text-white hover:underline"
              >
                {n.name}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}
