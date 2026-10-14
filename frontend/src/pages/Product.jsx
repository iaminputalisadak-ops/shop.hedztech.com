import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { products } from '../api';
import { useCart } from '../context/CartContext';
import SEO from '../components/SEO';

// Share icons
const FacebookIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>;
const TwitterIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A10.33 10.33 0 0 0 23 3z"/></svg>;
const LinkedinIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg>;
const WhatsAppIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>;
const CartIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>;

export default function Product() {
  const { id, slug } = useParams();
  const [product, setProduct] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [qty, setQty] = useState(1);
  const { addItem } = useCart();
  const navigate = useNavigate();

  useEffect(() => {
    products.get(id).then((r) => {
      const fetched = r.data;
      setProduct(fetched);
      if (fetched?.variants?.length) setSelectedVariant(fetched.variants[0]);

      // Canonicalize slug: if URL slug mismatches product slug, redirect to canonical URL
      const canonicalSlug = fetched?.slug;
      const productId = fetched?.id;
      if (productId && canonicalSlug) {
        const isNumericId = /^\d+$/.test(String(id));
        const urlSlug = slug || '';
        if (isNumericId && urlSlug !== canonicalSlug) {
          navigate(`/product/${productId}/${canonicalSlug}`, { replace: true });
        }
      }

      return products.list({ category_id: fetched?.category_id, limit: 8 });
    }).then((r) => {
      setRelated((r?.data || []).filter((p) => p.id !== parseInt(id, 10)));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="product-page"><div className="product-loading">Loading…</div></div>;
  if (!product) return <div className="product-page"><div className="product-loading">Product not found.</div></div>;

  const price = selectedVariant ? selectedVariant.price : product.price_min;
  const originalPrice = selectedVariant?.original_price || product.original_price || 0;
  const discountPercent = originalPrice > 0 ? Math.round(((originalPrice - price) / originalPrice) * 100) : product.discount_percent || 0;
  const savings = originalPrice > 0 ? originalPrice - price : 0;
  const shareUrl = encodeURIComponent(window.location.href);
  const shareTitle = encodeURIComponent(product.name);

  const handleBuyNow = () => {
    addItem({
      productId: product.id,
      variantId: selectedVariant?.id ?? null,
      productName: product.name,
      variantName: selectedVariant?.name ?? null,
      imageUrl: product.image_url ?? null,
      unitPrice: price,
      quantity: qty,
    });
    navigate('/checkout');
  };

  const BASE_URL = typeof window !== 'undefined' ? window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '') : '';
  const canonicalPath = product.slug ? `/product/${product.id}/${product.slug}` : `/product/${product.id}`;
  const productDescription = product.short_description || product.description || `Buy ${product.name} in Nepal. Genuine license key, instant delivery via WhatsApp, SMS & Email.`;
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: productDescription,
    image: product.image_url || undefined,
    sku: product.sku || product.id?.toString(),
    category: product.category_name || undefined,
    brand: product.brand_name ? { '@type': 'Brand', name: product.brand_name } : undefined,
    offers: {
      '@type': 'Offer',
      price: String(price),
      priceCurrency: 'NPR',
      availability: Number(price) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      url: typeof window !== 'undefined' ? window.location.href : '',
      seller: { '@type': 'Organization', name: 'Nepal TechGuard' },
    },
    aggregateRating: (product.rating > 0 && product.review_count > 0) ? {
      '@type': 'AggregateRating',
      ratingValue: String(product.rating),
      reviewCount: product.review_count,
    } : undefined,
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Products', item: `${BASE_URL}/` },
      { '@type': 'ListItem', position: 3, name: product.name, item: `${BASE_URL}${canonicalPath}` },
    ],
  };

const productFaqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      { '@type': 'Question', name: 'Is this a genuine license key?', acceptedAnswer: { '@type': 'Answer', text: 'Yes, all keys sold by Nepal TechGuard are genuine and verified for online activation.' } },
      { '@type': 'Question', name: 'How do I receive the key?', acceptedAnswer: { '@type': 'Answer', text: 'After purchase, the license key is delivered instantly via WhatsApp, SMS, and email within 60 seconds.' } },
      { '@type': 'Question', name: 'Can I transfer this license?', acceptedAnswer: { '@type': 'Answer', text: 'This depends on the license type (Retail vs OEM). Check the product details or contact us for clarification.' } },
      { '@type': 'Question', name: 'Do I get a refund if the key does not work?', acceptedAnswer: { '@type': 'Answer', text: 'We offer a money-back guarantee if the key cannot be activated. Contact our support within 7 days of purchase.' } },
    ],
  };

  const combinedJsonLd = [productJsonLd, breadcrumbJsonLd, productFaqJsonLd];

  const productUrl = (p) => p.slug ? `/product/${p.id}/${p.slug}` : `/product/${p.id}`;

  return (
    <div className="product-page">
      <SEO
        title={product.name}
        description={productDescription}
        image={product.image_url}
        canonicalPath={canonicalPath}
        type="product"
        jsonLd={combinedJsonLd}
      />
      {/* Breadcrumbs */}
      <nav className="product-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span className="product-breadcrumb-sep">&gt;</span>
        <span>Product Detail</span>
        <span className="product-breadcrumb-sep">&gt;</span>
        <span>{product.name}</span>
      </nav>

      <div className="product-detail">
        {/* Left: Image */}
        <div className="product-left">
          <div className="product-image-wrap">
            {product.discount_percent > 0 || discountPercent > 0 ? (
              <span className="product-sale-badge">Sale!</span>
            ) : null}
             {product.image_url ? (
               <img 
                 src={product.image_url} 
                 alt={product.name} 
                 className="product-image"
                 loading="lazy"
                 onError={(e) => {
                   e.target.onerror = null;
                   e.target.src = '/api/cover.php';
                 }}
               />
             ) : (
               <div className="product-image-placeholder">No image</div>
             )}
          </div>
          <p className="product-disclaimer">This image is for product reference only.</p>
          <p className="product-delivery-info">
            Instant Serial Key on WhatsApp, SMS and Email Delivery. Within a minute.
          </p>
          <div className="product-share">
            <a href={`https://www.facebook.com/sharer/sharer.php?u=${shareUrl}`} target="_blank" rel="noopener noreferrer" className="product-share-btn" aria-label="Facebook"><FacebookIcon /></a>
            <a href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareTitle}`} target="_blank" rel="noopener noreferrer" className="product-share-btn" aria-label="Twitter"><TwitterIcon /></a>
            <a href={`https://www.linkedin.com/shareArticle?mini=true&url=${shareUrl}&title=${shareTitle}`} target="_blank" rel="noopener noreferrer" className="product-share-btn" aria-label="LinkedIn"><LinkedinIcon /></a>
            <a href={`https://wa.me/?text=${shareTitle}%20${shareUrl}`} target="_blank" rel="noopener noreferrer" className="product-share-btn" aria-label="WhatsApp"><WhatsAppIcon /></a>
          </div>
        </div>

        {/* Right: Details */}
        <div className="product-right">
          <h1 className="product-title">{product.name}</h1>
          <div className="product-reviews">
            <span className="product-stars">{'★'.repeat(Math.round(product.rating || 0))}{'☆'.repeat(5 - Math.round(product.rating || 0))}</span>
            <span className="product-review-count">({product.review_count || 0} customer reviews)</span>
          </div>

          <dl className="product-specs">
            <div className="product-spec"><dt>Availability</dt><dd style={{ color: 'var(--success)' }}>{product.availability || 'In Stock'}</dd></div>
            <div className="product-spec"><dt>Version</dt><dd>{product.version_info || 'Latest'}</dd></div>
            <div className="product-spec"><dt>Sold Keys</dt><dd style={{ color: 'var(--success)' }}>{(product.sold_count || 0)}+</dd></div>
            <div className="product-spec"><dt>Delivery</dt><dd>Digital delivery within 60 seconds</dd></div>
            <div className="product-spec"><dt>Brand Name</dt><dd>{product.brand_name || product.category_name || '—'}</dd></div>
            <div className="product-spec"><dt>Region</dt><dd>{product.region || 'Nepal'}</dd></div>
          </dl>

          <div className="product-price-block">
            <span className="product-price-current">₹{price}</span>
            {originalPrice > 0 && (
              <>
                <span className="product-price-original">₹{originalPrice}</span>
                <p className="product-savings">You save ₹{savings.toFixed(0)} ({discountPercent}% Discount)</p>
              </>
            )}
          </div>
          <p className="product-delivery-note">Instant Free Digital Delivery within 60 sec</p>

          {product.variants?.length > 0 && (
            <div className="form-group product-variant-select">
              <label>Select Option</label>
              <select value={selectedVariant?.id ?? ''} onChange={(e) => setSelectedVariant(product.variants.find((v) => v.id === parseInt(e.target.value, 10)))}>
                {product.variants.map((v) => (
                  <option key={v.id} value={v.id}>₹{v.price} – {v.name}</option>
                ))}
              </select>
            </div>
          )}

          <div className="form-group product-qty-select">
            <label>Select Quantity:</label>
            <div className="product-qty-options">
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="product-qty-option">
                  <input type="radio" name="qty" value={n} checked={qty === n} onChange={() => setQty(n)} />
                  <span>{n}</span>
                </label>
              ))}
            </div>
          </div>

          <button type="button" className="btn btn-buy-now" onClick={handleBuyNow}>
            <CartIcon />
            Buy Now
          </button>
        </div>
      </div>

      {/* Related products */}
      {related.length > 0 && (
        <section className="product-related">
          <h2 className="product-related-title">
            Related {product.category_name || 'Products'}
          </h2>
          <div className="product-related-grid">
            {related.slice(0, 4).map((p) => (
               <Link key={p.id} to={productUrl(p)} className="product-related-card">
                 {p.image_url ? (
                   <img 
                     src={p.image_url} 
                     alt="" 
                     loading="lazy"
                     onError={(e) => {
                       e.target.onerror = null;
                       e.target.src = '/api/cover.php';
                     }}
                   />
                 ) : (
                   <div className="product-related-placeholder" />
                 )}
                 <span className="product-related-brand">{p.brand_name || p.category_name}</span>
                 <h3>{p.name}</h3>
                 <div className="product-related-price">
                   <span className="product-related-current">₹{p.variants?.[0]?.price ?? p.price_min}</span>
                   {(p.original_price > 0 || p.variants?.[0]?.original_price > 0) && (
                     <span className="product-related-original">₹{p.original_price || p.variants?.[0]?.original_price}</span>
                   )}
                 </div>
               </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
