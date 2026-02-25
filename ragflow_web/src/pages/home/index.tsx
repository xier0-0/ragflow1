import { Applications } from './applications';
import { NextBanner } from './banner';
import { Datasets } from './datasets';
import { Button } from '@/components/ui/button';
import { useNavigatePage } from '@/hooks/logic-hooks/navigate-hooks';
import { Plus } from 'lucide-react';

const Home = () => {
  const {
    navigateToDatasetList,
    navigateToChatList,
    navigateToSearchList,
  } = useNavigatePage();

  return (
    <section>
      <NextBanner></NextBanner>
      <section className="h-[calc(100dvh-260px)] overflow-auto px-10 space-y-6">
        <div className="grid md:grid-cols-3 gap-4">
          <Button
            variant="outline"
            className="h-16 text-left flex items-center gap-3 bg-bg-card"
            onClick={navigateToDatasetList}
          >
            <Plus className="size-4" />
            创建/查看知识库
          </Button>
          <Button
            variant="outline"
            className="h-16 text-left flex items-center gap-3 bg-bg-card"
            onClick={navigateToChatList}
          >
            <Plus className="size-4" />
            发起对话
          </Button>
          <Button
            variant="outline"
            className="h-16 text-left flex items-center gap-3 bg-bg-card"
            onClick={navigateToSearchList}
          >
            <Plus className="size-4" />
            创建/查看搜索
          </Button>
        </div>
        <div className="space-y-4">
          <Applications></Applications>
          <Datasets></Datasets>
        </div>
      </section>
    </section>
  );
};

export default Home;
