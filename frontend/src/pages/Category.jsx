import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { categories, products } from '../api';
import Card3D from '../components/Card3D';
import SEO from '../components/SEO';
import { useCart } from '../context/CartContext';

const sectionStyle = { padding: '2rem 1.5rem', maxWidth: 1200, margin: '0 auto' };
const cardStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '1.25rem',
};

export default function Category() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const [category, setCategory] = useState(null);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    categories.list().then((r) => {
      const c = (r.data || []).find((x) => x.slug === slug);
      setCategory(c);
      if (c) return products.list({ category_id: c.id });
      return { data: [] };
    }).then((r) => {
      setList(r.data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div className="page-section" style={sectionStyle}>
        <div className="loading-pulse">
          <div className="loading-dot" /><div className="loading-dot" /><div className="loading-dot" />
        </div>
      </div>
    );
  }
  if (!category) return <div className="page-section" style={sectionStyle}>Category not found.</div>;

  const categoryDesc = category.description || `Buy ${category.name} license keys in Nepal. Genuine software, instant delivery.`;

  const BASE_URL = typeof window !== 'undefined' ? window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '') : '';
  const canonicalPath = `/category/${category.slug}`;
  const categoryItemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: category.name,
    itemListElement: (list || []).map((p, idx) => ({
      '@type': 'Product',
      position: idx + 1,
      name: p.name,
      url: BASE_URL + (p.slug ? `/product/${p.id}/${p.slug}` : `/product/${p.id}`),
      image: p.image_url || undefined,
      offers: { '@type': 'Offer', price: String(p.variants?.[0]?.price ?? p.price_min ?? 0), priceCurrency: 'NPR' },
    })),
  };

  return (
    <motion.section
      className="page-section"
      style={sectionStyle}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <SEO
        title={`${category.name} License Keys - Buy Online in Nepal`}
        description={categoryDesc}
        canonicalPath={canonicalPath}
        type="website"
        jsonLd={[categoryItemList, {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
            { '@type': 'ListItem', position: 2, name: category.name, item: `${BASE_URL}${canonicalPath}` },
          ],
         }]}
      />
      <motion.h1
        style={{ fontFamily: 'var(--font-head)', fontSize: '1.75rem', marginBottom: 8 }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {category.name}
      </motion.h1>
      <motion.p
        style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        {category.description}
      </motion.p>
      <motion.div
        className="product-grid"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
      >
        {list.map((p) => (
          <motion.div key={p.id} variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}>
            <Card3D maxTilt={6}>
              <motion.div
                role="link"
                tabIndex={0}
                aria-label={`View ${p.name}`}
                style={{ ...cardStyle, cursor: 'pointer', position: 'relative' }}
                whileHover={{ boxShadow: '0 16px 40px rgba(59, 130, 246, 0.15)' }}
                transition={{ duration: 0.3 }}
                 onClick={() => navigate(p.slug ? `/product/${p.id}/${p.slug}` : `/product/${p.id}`)}
                 onKeyDown={(e) => {
                   if (e.key === 'Enter' || e.key === ' ') navigate(p.slug ? `/product/${p.id}/${p.slug}` : `/product/${p.id}`);
                }}
              >
                   {p.image_url && (
                     <div style={{ aspectRatio: 1 / 1, width: '100%', borderRadius: 8, marginBottom: 12, overflow: 'hidden', background: 'var(--surface2)' }}>
                       <img 
                         src={p.image_url} 
                         alt="" 
                         style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                         loading="lazy"
                         onError={(e) => {
                           e.target.onerror = null;
                           e.target.src = '/api/cover.php';
                         }}
                       />
                     </div>
                   )}
                  <h3 style={{ fontSize: '1rem', marginBottom: 6 }}>{p.name}</h3>
                  <div style={{ marginBottom: 8 }}>
                    {(() => {
                      const variants = p.variants || [];
                      const prices = variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
                      const minPrice = prices.length ? Math.min(...prices) : Number(p.price_min || 0);
                      const maxPrice = prices.length ? Math.max(...prices) : Number(p.price_max || minPrice);
                      const original = Number(p.original_price || variants?.[0]?.original_price || 0);
                      const hasDiscount = original > 0 && original > minPrice;
                      return (
                        <>
                          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                            {maxPrice > minPrice ? `₹${minPrice} – ₹${maxPrice}` : `₹${minPrice}`}
                          </span>
                          {hasDiscount && (
                            <span style={{ fontSize: 13, color: 'var(--text-muted)', marginLeft: 8, textDecoration: 'line-through' }}>
                              ₹{original}
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    style={{ width: '100%', position: 'relative', zIndex: 2, pointerEvents: 'auto' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      const variants = p.variants || [];
                      const v = variants?.[0];
                      const unitPrice = Number(v?.price ?? p.price_min ?? 0);
                      addItem({
                        productId: p.id,
                        variantId: v?.id ?? null,
                        productName: p.name,
                        variantName: v?.name ?? null,
                        imageUrl: p.image_url ?? null,
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
          </motion.div>
        ))}
      </motion.div>
    </motion.section>
  );
}
