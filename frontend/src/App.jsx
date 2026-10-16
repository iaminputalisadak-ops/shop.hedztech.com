import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import StoreLayout from './layouts/StoreLayout';
import AdminLayout from './layouts/AdminLayout';
import Home from './pages/Home';
import Category from './pages/Category';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Checkout from './pages/Checkout';
import SecurePayment from './pages/SecurePayment';
import AdminLogin from './admin/AdminLogin';
import AdminDashboard from './admin/AdminDashboard';
import AdminProducts from './admin/AdminProducts';
import AdminProductForm from './admin/AdminProductForm';
import AdminCategories from './admin/AdminCategories';
import AdminSettings from './admin/AdminSettings';
import AdminPages from './admin/AdminPages';
import AdminOrders from './admin/AdminOrders';
import AdminAiSeo from './admin/AdminAiSeo';
import AdminBlog from './admin/AdminBlog';
import AdminBlogEditor from './admin/AdminBlogEditor';
import AdminAudit from './admin/AdminAudit';
import AdminNotifications from './admin/AdminNotifications';
import ContentPage from './pages/ContentPage';
import FAQPage from './pages/FAQ';
import BlogIndex from './pages/BlogIndex';
import BlogPost from './pages/BlogPost';

function RequireAuth({ children }) {
  const token = localStorage.getItem('admin_token');
  if (!token) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<StoreLayout />}>
        <Route index element={<Home />} />
        <Route path="category/:slug" element={<Category />} />
        <Route path="product/:id/:slug?" element={<Product />} />
        <Route path="cart" element={<Cart />} />
        <Route path="checkout" element={<Checkout />} />
        <Route path="payment/:orderNumber" element={<SecurePayment />} />
        <Route path="refund-policy" element={<ContentPage slug="refund-policy" />} />
        <Route path="privacy-policy" element={<ContentPage slug="privacy-policy" />} />
        <Route path="terms" element={<ContentPage slug="terms" />} />
        <Route path="disclaimer" element={<ContentPage slug="disclaimer" />} />
        <Route path="about" element={<ContentPage slug="about" />} />
         <Route path="contact" element={<ContentPage slug="contact" />} />
         <Route path="faq" element={<FAQPage />} />
        <Route path="blog" element={<BlogIndex />} />
        <Route path="blog/:slug" element={<BlogPost />} />
      </Route>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="products" element={<AdminProducts />} />
        <Route path="products/new" element={<AdminProductForm />} />
        <Route path="products/edit/:id" element={<AdminProductForm />} />
        <Route path="ai-seo" element={<AdminAiSeo />} />
        <Route path="categories" element={<AdminCategories />} />
        <Route path="orders" element={<AdminOrders />} />
        <Route path="blog" element={<AdminBlog />} />
        <Route path="blog/new" element={<AdminBlogEditor />} />
        <Route path="blog/edit/:id" element={<AdminBlogEditor />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="pages" element={<AdminPages />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="notifications" element={<AdminNotifications />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
