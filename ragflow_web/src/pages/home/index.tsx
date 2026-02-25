import { Applications } from './applications';
import { NextBanner } from './banner';
import { Datasets } from './datasets';

const Home = () => {
  return (
    <section>
      <NextBanner></NextBanner>
      <section className="h-[calc(100dvh-260px)] overflow-auto px-10 space-y-6">
        <Applications></Applications>
        <Datasets></Datasets>
      </section>
    </section>
  );
};

export default Home;
