import { PageHeader } from '@/components/page-header';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useNavigatePage } from '@/hooks/logic-hooks/navigate-hooks';
import { useFetchKnowledgeBaseConfiguration } from '@/hooks/use-knowledge-request';
import { KnowledgeBaseProvider } from '@/pages/dataset/contexts/knowledge-base-context';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { SideBar } from './sidebar';
import { Button } from '@/components/ui/button';

export default function DatasetWrapper() {
  const { navigateToDatasetList } = useNavigatePage();
  const { t } = useTranslation();
  const { data, loading } = useFetchKnowledgeBaseConfiguration();

  return (
    <KnowledgeBaseProvider knowledgeBase={data} loading={loading}>
      <section className="flex h-full flex-col w-full">
        <PageHeader>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={navigateToDatasetList}>
              {t('common.back')}
            </Button>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink onClick={navigateToDatasetList}>
                    {t('knowledgeDetails.dataset')}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="w-28 whitespace-nowrap text-ellipsis overflow-hidden">
                    {data.name}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </PageHeader>
        <div className="flex flex-1 min-h-0">
          <SideBar></SideBar>
          <div className="flex-1 overflow-auto">
            <Outlet />
          </div>
        </div>
      </section>
    </KnowledgeBaseProvider>
  );
}
