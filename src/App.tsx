/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import TopAppBar from './components/TopAppBar';
import Hero from './components/Hero';
import Positioning from './components/Positioning';
import About from './components/About';
import Pricing from './components/Pricing';
import Team from './components/Team';
import Content from './components/Content';
import Footer from './components/Footer';

export default function App() {
  return (
    <div className="font-sans text-on-surface bg-background antialiased min-h-screen">
      <TopAppBar />
      <main>
        <Hero />
        <Positioning />
        <About />
        <Pricing />
        <Team />
        <Content />
      </main>
      <Footer />
    </div>
  );
}
