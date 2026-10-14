import React, { useEffect, useState, useRef, Suspense } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { categories, products } from '../api';
import HeroScene3D from '../components/HeroScene3D';
import Card3D from '../components/Card3D';
import ParallaxHero from '../components/ParallaxHero';
import Section3DBg from '../components/Section3DBg';
import SEO from '../components/SEO';
import { useCart } from '../context/CartContext';

const BANNER_TITLE = 'Genuine Software & License Keys';
const BANNER_TITLE_WORDS = ['Genuine', 'Software', '&', 'License', 'Keys'];
const BANNER_SUBTITLE = 'Windows • MS Office • Antivirus • Adobe – Instant delivery, secure payment';
const DEFAULT_DESC = 'Buy genuine Windows, MS Office, Antivirus & Adobe license keys in Nepal. Instant delivery via WhatsApp, SMS & Email. Trusted since 2024.';

const sectionStyle = { padding: '2rem 1.5rem', maxWidth: 1200, margin: '0 auto' };
const sectionClassName = 'page-section';
const gridClass = 'home-category-grid';
const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '1.25rem',
  transition: 'border-color 0.2s',
};
const titleStyle = { fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text)' };

const FALLBACK_CATEGORIES = [
  { id: 1, name: 'Windows', slug: 'windows', description: 'Windows 7, 8.1, 10 & 11 Pro, Home Retail and OEM' },
  { id: 2, name: 'MS Office', slug: 'ms-office', description: 'Office 2016, 2019, 2021, 2024 Professional Plus' },
  { id: 3, name: 'Antivirus', slug: 'antivirus', description: 'Quick Heal, Kaspersky, K7, McAfee and more' },
  { id: 4, name: 'Design & Editing', slug: 'design-editing', description: 'Adobe Creative Cloud, Canva Pro' },
];
const FALLBACK_PRODUCTS = [
  { id: 1, name: 'Windows 11 Pro Retail Key', price_min: 549, original_price: 11489, variants: [{ price: 549 }], category_slug: 'windows' },
  { id: 2, name: 'Windows 10 Pro Retail Key', price_min: 549, original_price: 8900, variants: [{ price: 549 }], category_slug: 'windows' },
  { id: 3, name: 'MS Office 2021 Pro Plus', price_min: 449, original_price: 0, variants: [{ price: 449 }], category_slug: 'ms-office' },
  { id: 4, name: 'Office 365 Pro Plus – 5 Devices', price_min: 349, original_price: 6499, variants: [{ price: 349 }], category_slug: 'ms-office' },
  { id: 5, name: 'Quick Heal Total Security 1 Year', price_min: 1299, original_price: 0, variants: [{ price: 1299 }], category_slug: 'antivirus' },
  { id: 6, name: 'K7 Total Security 1 User 1 Year', price_min: 499, original_price: 0, variants: [{ price: 499 }], category_slug: 'antivirus' },
];

// Animated counter component
function AnimatedCounter({ value, suffix = '', duration = 1.5 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-50px' });

  useEffect(() => {
    if (!inView) return;
    const end = parseInt(value, 10);
    const startTime = Date.now();
    const animate = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.floor(eased * end));
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [inView, value, duration]);

  return <span ref={ref}>{count}{suffix}</span>;
}

export default function Home() {
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get('search') || '';
  const isSearchMode = searchQuery.length > 0;

  const [categoriesList, setCategoriesList] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [apiOffline, setApiOffline] = useState(false);

  useEffect(() => {
    if (isSearchMode) {
      setLoading(false);
      setSearchLoading(true);
      products.list({ search: searchQuery, limit: 50 })
        .then((r) => setSearchResults(r.data || []))
        .catch(() => {
          const q = searchQuery.toLowerCase();
          const filtered = FALLBACK_PRODUCTS.filter((p) =>
            p.name.toLowerCase().includes(q) || (p.category_slug && p.category_slug.toLowerCase().includes(q))
          );
          setSearchResults(filtered);
        })
        .finally(() => setSearchLoading(false));
      return;
    }
    setSearchResults([]);
    Promise.all([categories.list(), products.list({ featured: 1, limit: 8 })])
      .then(([catRes, prodRes]) => {
        setApiOffline(false);
        setCategoriesList(catRes.data || []);
        setFeatured(prodRes.data || []);
      })
      .catch(() => {
        setApiOffline(true);
        setCategoriesList(FALLBACK_CATEGORIES);
        setFeatured(FALLBACK_PRODUCTS);
      })
      .finally(() => setLoading(false));
  }, [searchQuery, isSearchMode]);

  if (loading && !isSearchMode) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={sectionClassName}
        style={sectionStyle}
      >
        <div className="loading-pulse">
          <div className="loading-dot" />
          <div className="loading-dot" />
          <div className="loading-dot" />
        </div>
      </motion.div>
    );
  }

  // Search results view
  if (isSearchMode) {
    return (
      <motion.section
        className={sectionClassName}
        style={{ ...sectionStyle, paddingTop: '2.5rem' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>
            Search results for &quot;{searchQuery}&quot;
          </h1>
          <Link to="/" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>← Back to home</Link>
        </div>
        {searchLoading ? (
          <div className="loading-pulse">
            <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
          </div>
        ) : searchResults.length === 0 ? (
          <p style={{ padding: '2rem', background: 'var(--surface2)', borderRadius: 'var(--radius)', color: 'var(--text-muted)', textAlign: 'center' }}>
            No products found for &quot;{searchQuery}&quot;. Try different keywords.
          </p>
        ) : (
          <motion.div
            className={gridClass}
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {searchResults.map((p) => (
              <motion.div key={p.id} variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
                <ProductCard product={p} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.section>
    );
  }

  return (
    <>
      <SEO
        title="Genuine Software & License Keys in Nepal"
        description={DEFAULT_DESC}
        canonicalPath="/"
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            name: 'Nepal TechGuard',
            url: typeof window !== 'undefined' ? window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '') : '',
            potentialAction: [
              {
                '@type': 'SearchAction',
                target: typeof window !== 'undefined' ? `${window.location.origin}${(import.meta.env.BASE_URL || '/').replace(/\/$/, '')}/?search={search_term_string}` : '',
                'query-input': 'required name=search_term_string',
              },
            ],
            inLanguage: 'en-NP',
          },
          {
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'Nepal TechGuard',
            url: typeof window !== 'undefined' ? window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '') : '',
            description: DEFAULT_DESC,
            areaServed: { '@type': 'Country', name: 'Nepal' },
            contactPoint: [{
              '@type': 'ContactPoint',
              telephone: '+977-9800000000',
              email: 'support@nepaltechguard.com',
              contactType: 'customer service',
              areaServed: 'NP',
              availableLanguage: ['English', 'Nepali'],
            }],
          },
        ]}
      />
      {/* Hero – full viewport with 3D background */}
      <section className="home-hero">
        <div className="home-hero-bg">
          <Suspense fallback={null}>
            <HeroScene3D />
          </Suspense>
          <div className="home-hero-mesh" />
          <div className="home-hero-gradient" />
          <div className="home-hero-glow" />
        </div>
        <ParallaxHero className="home-hero-content">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="home-hero-label"
          >
            Nepal TechGuard — Trusted Since 2024
          </motion.div>
          <div className="home-hero-title">
            {BANNER_TITLE_WORDS.map((word, i) => (
              <motion.span
                key={word + i}
                className="home-hero-word"
                initial={{ opacity: 0, y: 60 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.3 + i * 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                {word}
              </motion.span>
            ))}
          </div>
          <motion.p
            className="home-hero-subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2, duration: 0.6 }}
          >
            {BANNER_SUBTITLE}
          </motion.p>
          <motion.div
            className="home-hero-cta-wrap"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 0.5 }}
          >
            <Link to="/category/windows" className="home-hero-cta">
              Shop Now
            </Link>
            <Link to="/category/ms-office" className="home-hero-cta home-hero-cta-outline">
              Office Keys
            </Link>
          </motion.div>
          <motion.div
            className="home-hero-scroll"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2 }}
          >
            <span className="home-hero-scroll-text">Scroll</span>
            <motion.span
              className="home-hero-scroll-line"
              animate={{ scaleY: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </ParallaxHero>
      </section>

      {/* Stats bar */}
      <motion.section
        className="home-stats"
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6 }}
      >
        <div className="home-stats-inner">
          <div className="home-stat">
            <span className="home-stat-value"><AnimatedCounter value={categoriesList.length + 20} /></span>
            <span className="home-stat-label">Categories</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-value"><AnimatedCounter value="199" /></span>
            <span className="home-stat-label">Products</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-value"><AnimatedCounter value="5000" suffix="+" /></span>
            <span className="home-stat-label">Happy Customers</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-value"><AnimatedCounter value="24" suffix={'/7'} /></span>
            <span className="home-stat-label">Support</span>
          </div>
        </div>
      </motion.section>

      {/* Trust / benefit content section for SEO */}
      <motion.section
        className={sectionClassName}
        style={sectionStyle}
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.6 }}
      >
        <div style={{ maxWidth: 800, margin: '0 auto 2rem' }}>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.3rem', fontWeight: 700, marginBottom: '1rem', textAlign: 'center' }}>Genuine Software, Instant Delivery in Nepal</h2>
          <p style={{ lineHeight: 1.7, marginBottom: '1rem' }}>
            Nepal TechGuard is your trusted source for genuine Windows, MS Office, Antivirus, and Adobe license keys. We deliver instantly via WhatsApp, SMS, and email within 60 seconds of purchase. Every key comes with a satisfaction guarantee and local support.
          </p>
          <p style={{ lineHeight: 1.7, marginBottom: '1rem' }}>
            Whether you need a Windows 11 Pro license, Office 2024 Professional Plus, or Quick Heal antivirus protection, we offer genuine product keys at competitive prices across Nepal. Our instant delivery means you get your activation key the same minute — no waiting for physical shipment.
          </p>
          <p style={{ lineHeight: 1.7 }}>
            We also help with <Link to="/blog">software licensing guides, activation troubleshooting, and security best practices</Link> so you can make confident purchasing decisions. Browse by category below to find the perfect license for your Windows PC, Mac, or mobile device.
          </p>
        </div>
      </motion.section>

      {/* Categories – scroll reveal with 3D animated background */}
      <Section3DBg className={sectionClassName} style={{ ...sectionStyle, paddingTop: '3rem', paddingBottom: '3rem' }}>
        <motion.section
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            style={{ textAlign: 'center', marginBottom: '2rem' }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>Nepal TechGuard</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>Genuine Windows, MS Office & Antivirus License Keys – Instant delivery</p>
          </motion.div>
          <h2 style={titleStyle}>Shop by category</h2>
          <motion.div
            className={gridClass}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-40px' }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
          >
            {categoriesList.map((c) => (
              <CategoryCard key={c.id} category={c} />
            ))}
          </motion.div>
        </motion.section>
      </Section3DBg>

      {/* Featured products – scroll reveal */}
      <motion.section
        className={sectionClassName}
        style={sectionStyle}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: '-60px' }}
      >
        <motion.h2
          style={titleStyle}
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
        >
          Featured products
        </motion.h2>
        <motion.div
          className={gridClass}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-40px' }}
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
        >
          {featured.map((p) => (
            <motion.div key={p.id} variants={{ hidden: { opacity: 0, y: 25 }, visible: { opacity: 1, y: 0 } }}>
              <ProductCard product={p} />
            </motion.div>
          ))}
        </motion.div>
        <motion.div
          style={{ textAlign: 'center', marginTop: '2rem' }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          {categoriesList[0] && (
            <Link to={`/category/${categoriesList[0].slug}`} className="btn btn-primary">
              View all products
            </Link>
          )}
        </motion.div>
      </motion.section>

      {apiOffline && (
        <motion.section
          className={sectionClassName}
          style={sectionStyle}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p style={{ padding: '1rem', background: 'var(--surface2)', borderRadius: 'var(--radius)', color: 'var(--text-muted)', fontSize: 14 }}>
            Showing sample products. Start your PHP backend (e.g. XAMPP) and run the database schema to load real data and use admin login.
          </p>
        </motion.section>
      )}
    </>
  );
}

function CategoryCard({ category }) {
  return (
    <motion.div variants={{ hidden: { opacity: 0, y: 30 }, visible: { opacity: 1, y: 0 } }}>
      <Card3D maxTilt={12}>
        <Link
          to={'/category/' + category.slug}
          className="home-category-card"
          style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <motion.div className="home-category-img" whileHover={{ scale: 1.03 }} transition={{ duration: 0.3 }}>
            {category.image_url ? (
              <img src={category.image_url} alt="" />
            ) : (
              <span className="home-category-icon">📦</span>
            )}
          </motion.div>
          <h3>{category.name}</h3>
          <p>{category.description || 'View products'}</p>
        </Link>
      </Card3D>
    </motion.div>
  );
}

function ProductCard({ product }) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const variants = product.variants || [];
  const prices = variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
  const minPrice = prices.length ? Math.min(...prices) : Number(product.price_min || 0);
  const maxPrice = prices.length ? Math.max(...prices) : Number(product.price_max || minPrice);
  const displayPrice = maxPrice > minPrice ? `₹${minPrice} – ₹${maxPrice}` : `₹${minPrice}`;
  const original = Number(product.original_price || variants?.[0]?.original_price || 0);
  const hasDiscount = original > 0 && original > minPrice;

  return (
    <Card3D maxTilt={6}>
      <motion.div
        role="link"
        tabIndex={0}
        aria-label={`View ${product.name}`}
        style={{ ...cardStyle, cursor: 'pointer', position: 'relative' }}
        whileHover={{ boxShadow: '0 16px 40px rgba(59, 130, 246, 0.15)' }}
        transition={{ duration: 0.3 }}
         onClick={() => navigate(product.slug ? `/product/${product.id}/${product.slug}` : `/product/${product.id}`)}
         onKeyDown={(e) => {
           if (e.key === 'Enter' || e.key === ' ') navigate(product.slug ? `/product/${product.id}/${product.slug}` : `/product/${product.id}`);
        }}
      >
           {product.image_url && (
             <div style={{ aspectRatio: 1 / 1, width: '100%', borderRadius: 8, marginBottom: 12, overflow: 'hidden', background: 'var(--surface2)' }}>
               <motion.img
                 src={product.image_url}
                 alt=""
                 style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                 loading="lazy"
                 onError={(e) => {
                   e.target.onerror = null;
                   e.target.src = '/api/cover.php';
                 }}
                 whileHover={{ scale: 1.02 }}
                 transition={{ duration: 0.3 }}
               />
             </div>
           )}
          <h3 style={{ fontSize: '1rem', marginBottom: 6, lineHeight: 1.3 }}>{product.name}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{displayPrice}</span>
            {hasDiscount && (
              <span style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                ₹{original}
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            style={{ marginTop: 12, width: '100%', position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
            onClick={(e) => {
              e.stopPropagation();
              const v = variants?.[0];
              const unitPrice = Number(v?.price ?? product.price_min ?? 0);
              addItem({
                productId: product.id,
                variantId: v?.id ?? null,
                productName: product.name,
                variantName: v?.name ?? null,
                imageUrl: product.image_url ?? null,
                unitPrice,
                quantity: 1,
              });
              navigate('/checkout');
            }}
          >
            Buy now
          </button>
      </motion.div>
    </Card3D>
  );
}
