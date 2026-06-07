import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from './lib/supabase';
import './App.css';

type BasePizza = 'blanche' | 'rouge';

type PizzaOrder = {
  id: string;
  prenom: string;
  base: BasePizza;
  ingredients: string[];
  status: 'nouvelle' | 'faite' | 'annulee';
  created_at: string;
};

const ingredientsList = [
  'Jambon',
  'Bacon',
  'Chorizo',
  'Anchois',
  'Champignons',
  'Brie',
  'Mozzarella',
  'Gorgonzola',
  'Emmental',
  'Olives',
  'Noix',
  'Origan',
  'Basilic',
  'Roquette',
];
function CommandePage() {
  const [prenom, setPrenom] = useState('');
  const [base, setBase] = useState<BasePizza>('rouge');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  function toggleIngredient(name: string) {
    setIngredients((current) =>
      current.includes(name)
        ? current.filter((item) => item !== name)
        : [...current, name]
    );
  }

  async function envoyerCommande() {
    if (!prenom.trim()) {
      setMessage('Merci d’indiquer ton prénom.');
      return;
    }

    setLoading(true);
    setMessage('');

    const { error } = await supabase.from('pizza_orders').insert({
      prenom: prenom.trim(),
      base,
      ingredients,
      status: 'nouvelle',
    });

    setLoading(false);

    if (error) {
      console.error('Erreur Supabase :', error);
      setMessage(`Erreur Supabase : ${error.message}`);
      return;
    }

    setMessage(`Merci ${prenom.trim()} ! Ta pizza a été envoyée au fourneau 🍕`);
    setPrenom('');
    setBase('rouge');
    setIngredients([]);
  }

  return (
    <main className="phone-page">
      <section className="phone-card">
        <h1>Ma pizza 🍕</h1>
        <p className="subtitle">Choisis ta base et tes ingrédients.</p>

        <label className="field-label">Prénom</label>
        <input
          className="text-input"
          value={prenom}
          onChange={(e) => setPrenom(e.target.value)}
          placeholder="Ex : Julien"
        />

        <label className="field-label">Base</label>
        <div className="base-buttons">
          <button
            className={
              base === 'blanche'
                ? 'base-button selected-white'
                : 'base-button'
            }
            onClick={() => setBase('blanche')}
            type="button"
          >
            Base blanche
          </button>

          <button
            className={
              base === 'rouge'
                ? 'base-button selected-red'
                : 'base-button'
            }
            onClick={() => setBase('rouge')}
            type="button"
          >
            Base rouge
          </button>
        </div>

        <label className="field-label">Ingrédients</label>
        <div className="ingredients-list">
          {ingredientsList.map((item) => (
            <label key={item} className="ingredient-row">
              <input
                type="checkbox"
                checked={ingredients.includes(item)}
                onChange={() => toggleIngredient(item)}
              />
              <span>{item}</span>
            </label>
          ))}
        </div>

        <button
          className="send-button"
          onClick={envoyerCommande}
          disabled={loading}
        >
          {loading ? 'Envoi...' : 'Envoyer ma pizza'}
        </button>

        {message && <p className="message">{message}</p>}
      </section>
    </main>
  );
}

function FourneauPage() {
  const [orders, setOrders] = useState<PizzaOrder[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioEnabledRef = useRef(false);

  function sortOrders(items: PizzaOrder[]) {
    return [...items].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  function getAudioContext() {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    return audioContextRef.current;
  }

  async function activerSon() {
    const audioContext = getAudioContext();

    if (!audioContext) {
      return;
    }

    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    audioEnabledRef.current = true;
    setAudioEnabled(true);

    playNotificationSound();
  }

  function playNotificationSound() {
    if (!audioEnabledRef.current) {
      return;
    }

    const audioContext = getAudioContext();

    if (!audioContext) {
      return;
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);

    gain.gain.setValueAtTime(0.001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.25,
      audioContext.currentTime + 0.03
    );
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      audioContext.currentTime + 0.35
    );

    oscillator.connect(gain);
    gain.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.35);
  }

  async function loadOrders() {
    const { data, error } = await supabase
      .from('pizza_orders')
      .select('*')
      .eq('status', 'nouvelle')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Erreur chargement commandes :', error);
      return;
    }

    setOrders(data ?? []);
  }

  useEffect(() => {
    loadOrders();

    const channel = supabase
      .channel('pizza-orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pizza_orders',
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newOrder = payload.new as PizzaOrder;

            if (newOrder.status === 'nouvelle') {
              setOrders((current) => {
                const alreadyExists = current.some(
                  (order) => order.id === newOrder.id
                );

                if (alreadyExists) {
                  return current;
                }

                return sortOrders([...current, newOrder]);
              });

              playNotificationSound();
            }
          }

          if (payload.eventType === 'UPDATE') {
            const updatedOrder = payload.new as PizzaOrder;

            setOrders((current) => {
              if (updatedOrder.status !== 'nouvelle') {
                return current.filter((order) => order.id !== updatedOrder.id);
              }

              const exists = current.some(
                (order) => order.id === updatedOrder.id
              );

              if (!exists) {
                return sortOrders([...current, updatedOrder]);
              }

              return sortOrders(
                current.map((order) =>
                  order.id === updatedOrder.id ? updatedOrder : order
                )
              );
            });
          }

          if (payload.eventType === 'DELETE') {
            const oldOrder = payload.old as PizzaOrder;

            setOrders((current) =>
              current.filter((order) => order.id !== oldOrder.id)
            );
          }
        }
      )
      .subscribe();

    const refreshInterval = window.setInterval(() => {
      loadOrders();
    }, 30000);

    return () => {
      window.clearInterval(refreshInterval);
      supabase.removeChannel(channel);
    };
  }, []);

  async function marquerFaite(id: string) {
    const { error } = await supabase
      .from('pizza_orders')
      .update({ status: 'faite' })
      .eq('id', id);

    if (error) {
      console.error('Erreur mise à jour commande :', error);
      return;
    }

    setOrders((current) => current.filter((order) => order.id !== id));
  }

  const visibleOrders = orders.slice(0, 6);
  const waitingCount = Math.max(orders.length - 6, 0);

  return (
    <main className="kitchen-page">
      <header className="kitchen-header">
        <div>
          <h1>Fourneau 🍕</h1>
          <p>Commandes en attente : {orders.length}</p>
        </div>

        <div className="kitchen-actions">
          <button
            className={audioEnabled ? 'sound-button active' : 'sound-button'}
            onClick={activerSon}
            type="button"
          >
            {audioEnabled ? 'Son activé 🔔' : 'Activer le son 🔕'}
          </button>

          {waitingCount > 0 && (
            <div className="waiting-badge">+{waitingCount} en attente</div>
          )}
        </div>
      </header>

      <section className="orders-grid">
        {visibleOrders.map((order) => (
          <article key={order.id} className={`order-card ${order.base}`}>
            <div className="order-top">
              <h2>{order.prenom}</h2>
              <span>
                {new Date(order.created_at).toLocaleTimeString('fr-FR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            <div className={`base-badge ${order.base}`}>
              {order.base === 'rouge' ? 'Base rouge' : 'Base blanche'}
            </div>

            <ul>
              {order.ingredients.length === 0 ? (
                <li>Aucun ingrédient</li>
              ) : (
                order.ingredients.map((ingredient) => (
                  <li key={ingredient}>{ingredient}</li>
                ))
              )}
            </ul>

            <button
              className="done-button"
              onClick={() => marquerFaite(order.id)}
            >
              Pizza faite
            </button>
          </article>
        ))}

        {visibleOrders.length === 0 && (
          <div className="empty-state">Aucune commande pour le moment.</div>
        )}
      </section>
    </main>
  );
}

function QRPage() {
  const commandeUrl = `${window.location.origin}/commande`;
  const fourneauUrl = `${window.location.origin}/fourneau`;

  return (
    <main className="qr-page">
      <section className="qr-card">
        <h1>QR codes pizza 🍕</h1>
        <p>Scanne le QR code souhaité.</p>

        <div className="qr-grid">
          <div className="qr-item">
            <h2>Commande</h2>
            <div className="qr-box">
              <QRCodeSVG value={commandeUrl} size={260} />
            </div>
            <p className="qr-url">{commandeUrl}</p>
          </div>

          <div className="qr-item">
            <h2>Fourneau</h2>
            <div className="qr-box">
              <QRCodeSVG value={fourneauUrl} size={260} />
            </div>
            <p className="qr-url">{fourneauUrl}</p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const path = window.location.pathname;

  if (path === '/fourneau') {
    return <FourneauPage />;
  }

  if (path === '/qr') {
    return <QRPage />;
  }

  return <CommandePage />;
}