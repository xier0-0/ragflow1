import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useSetModalState } from '@/hooks/common-hooks';
import { Docagg } from '@/interfaces/database/chat';
import PdfDrawer from '@/pages/next-search/document-preview-modal';
import { middleEllipsis } from '@/utils/common-util';
import { downloadDocument } from '@/utils/file-util';
import { Download } from 'lucide-react';
import { useState } from 'react';
import FileIcon from '../file-icon';

export function ReferenceDocumentList({ list }: { list: Docagg[] }) {
  const { visible, showModal, hideModal } = useSetModalState();
  const [selectedDocument, setSelectedDocument] = useState<Docagg>();
  return (
    <section className="flex gap-3 flex-wrap">
      {list.map((item) => (
        <Card key={item.doc_id}>
          <CardContent
            className="flex items-center p-2 space-x-2 cursor-pointer justify-between"
          >
            <div
              className="flex items-center gap-2"
              onClick={() => {
                setSelectedDocument(item);
                showModal();
              }}
            >
              <FileIcon id={item.doc_id} name={item.doc_name}></FileIcon>
              <div className="text-text-sub-title-invert">
                {middleEllipsis(item.doc_name)}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-2"
              onClick={(e) => {
                e.stopPropagation();
                downloadDocument({ id: item.doc_id, filename: item.doc_name });
              }}
            >
              <Download className="size-4" />
            </Button>
          </CardContent>
        </Card>
      ))}
      {visible && selectedDocument && (
        <PdfDrawer
          visible={visible}
          hideModal={hideModal}
          documentId={selectedDocument.doc_id}
          chunk={{
            document_name: selectedDocument.doc_name,
          }}
        ></PdfDrawer>
      )}
    </section>
  );
}
