# Spécification Technique & Kit UI/UX — Éditeur « Bento Pastel Sémantique » (EasyHomeGuide.com)

> **Instructions pour l'Assistant de Code IA (Cursor / Windsurf / Claude Code / Copilot)** :
> Ce document contient l'intégralité des règles produit, du Design System (« Bento Pastel Sémantique »), de l'architecture Hypermedia (**PHP 8 + HTMX + SQLite + Tailwind CSS**) et des comportements ergonomiques **Responsive (Mobile & PC)** de l'éditeur de fiches **EasyHomeGuide**. Respectez strictement ces contraintes lors de la génération ou de la modification du code.

---

## 1. Philosophie Produit & Architecture de l'Information

**EasyHomeGuide** (`easyhomeguide.com`) transforme des livrets d'accueil en vrac (PDF, Word) en une web-app structurée, esthétique et consultable par les voyageurs.
**Principe fondamental** : *« Le plus important est l'information, pas sa mise en forme. C'est à l'application de se débrouiller. »*

### Hiérarchie des données
`HomeGuide` (Logement) ➔ `Rubriques` (Icônes thématiques) ➔ `Fiche Pratique` (ex: *Cafetière*, *Arrivée*, *Poubelles*) ➔ `Blocs Sémantiques` (empilés verticalement).

### Les 8 Règles d'Or Ergonomiques (Strictes)
1. **Zéro Markdown & Zéro mise en page complexe** : L'utilisateur ne choisit jamais une taille de police ou une couleur de carte manuellement.
2. **Séparation stricte entre Sémantique du Bloc et Dynamique du Texte** :
   - **La Sémantique du bloc** se change uniquement via la **Combobox (`<select>`)** située en haut à gauche de chaque carte Bento (`Titre`, `Texte`, `Astuce`, `Conseil`, `Consigne`, `Liste à puces`, `Code / Clé`).
   - **La Dynamique du texte** se gère via une **petite barre contextuelle flottante noire (esprit Medium)** qui apparaît au-dessus du texte sélectionné et propose **uniquement** : **Gras (`B`)**, **Italique (`I`)**, **Souligner (`U`)**, **Surligner pastel (`<mark class="ehg-highlight">`)** et **Gomme**. Elle ne contient **aucune combobox**.
3. **Zéro défilement horizontal (No Horizontal Slide)** : Toutes les sélections passent par des **Combobox natives** ou des **Modales en grille verticale**.
4. **Rail d'action vertical à droite de chaque carte (`▲` / `⋮⋮` / `▼`)** :
   - `▲` : Monter le bloc d'un cran.
   - `⋮⋮` : Poignée centrale pour glisser-déposer (Drag & Drop souris sur PC et tactile sur Mobile).
   - `▼` : Descendre le bloc d'un cran.
5. **Double système d'ajout (`+`)** :
   - Un petit bouton **`+` centré sur une ligne** entre chaque bloc pour insérer un élément exactement à cet endroit.
   - Un grand bouton **`+ Ajouter un bloc à la fiche`** fixe en bas de l'écran.
6. **Bascule directe `Mode Édition` / `Visualisation Invité`** :
   - Un bouton segmenté unique en haut de l'écran bascule entre l'éditeur et la vue finale du voyageur (sans bandeau explicatif superflu ni barre de recherche interne à la fiche).
7. **Suppression sécurisée par Modale** :
   - Cliquer sur l'icône corbeille (`🗑️`) ouvre obligatoirement une **Modale de confirmation** rappelant le badge sémantique et un extrait du texte avant suppression définitive.
8. **Architecture 100 % Responsive (Mobile, Tablette & PC)** :
   - **Mobile (`< 640px`)** : Plein écran natif (`w-full h-full`), rail d'action tactile de `40px` (`w-10`), modales en *Bottom-Sheet* (`rounded-t-3xl`), et glisser-déposer tactile (`touchstart`/`touchmove`/`touchend`) sur la poignée `⋮⋮`.
   - **Tablette & PC (`>= 640px`)** : Conteneur éditorial centré fluide (`w-full max-w-3xl sm:rounded-3xl sm:shadow-xl`), avec possibilité de basculer en aperçu Smartphone `430px` en 1 clic.

---

## 2. Kit UI / UX — Design System « Bento Pastel Sémantique »

### Typographie & Surlignage
- **UI & Corps de texte** : `Plus Jakarta Sans` (`400`, `500`, `600`, `700`, `800`)
- **Titres de sections (`title`)** : `Newsreader` (Serif éditorial chaleureux, `600`)
- **Codes, Clés & Wi-Fi (`secret`)** : `JetBrains Mono` (Monospace, `600`)
- **Surlignage pastel (`<mark class="ehg-highlight">`)** :
  ```css
  mark, .ehg-highlight {
      background-color: #fde68a; /* Amber 200 */
      color: #1c1917;
      padding: 0.05rem 0.28rem;
      border-radius: 0.3rem;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
  }
  ```

### Palette des 7 Blocs Textuels Convertibles + 3 Blocs Médias

| Type ID | Label UI | Fond Carte (Tailwind / Hex) | Bordure Carte | Style Combobox / Badge | Icône Lucide |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `title` | **Titre de section** | `bg-white` | `border-stone-300/90` | `bg-stone-900 text-white border-stone-900` | `heading` |
| `text` | **Texte / Explication** | `bg-[#FAF8F5]` (Ivoire) | `border-stone-200/90` | `bg-stone-200/80 text-stone-800 border-stone-300/80` | `align-left` |
| `tip` | **Astuce pratique** | `bg-[#EEF6F0]` (Vert Sauge) | `border-emerald-200/90` | `bg-emerald-100 text-emerald-900 border-emerald-300/80` | `sparkles` |
| `advice` | **Conseil local** | `bg-[#F3F1FA]` (Lavande) | `border-indigo-200/80` | `bg-indigo-100 text-indigo-900 border-indigo-300/80` | `compass` |
| `warning` | **Consigne / Vigilance**| `bg-[#FDF6E9]` (Ambre Sable)| `border-amber-200/90` | `bg-amber-100 text-amber-900 border-amber-300/80` | `alert-triangle`|
| `list` | **Liste à puces** | `bg-[#F5F5F0]` (Crème) | `border-stone-300/80` | `bg-stone-200 text-stone-800 border-stone-300` | `list-checks` |
| `secret` | **Code / Clé / Wi-Fi** | `bg-[#EFF5FB]` (Bleu Brume) | `border-sky-200/90` | `bg-sky-100 text-sky-900 border-sky-300/80` | `key-round` |
| `photo` | **Photo explicative** | `bg-white` | `border-stone-200/90` | `bg-stone-100 text-stone-700 border-stone-200` | `image` |
| `audio` | **Mémo Vocal (15s)** | `bg-purple-50/60` | `border-purple-200/80` | `bg-purple-100 text-purple-900 border-purple-200` | `mic` |
| `video` | **Mini Vidéo (Démo)** | `bg-rose-50/50` | `border-rose-200/80` | `bg-rose-100 text-rose-900 border-rose-200` | `video` |

---

## 3. Schéma de Base de Données SQLite (`schema.sql`)

```sql
CREATE TABLE fiches (
    id TEXT PRIMARY KEY,
    guide_id TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Équipements',
    icon TEXT NOT NULL DEFAULT '☕',
    title TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE fiche_blocks (
    id TEXT PRIMARY KEY,
    fiche_id TEXT NOT NULL,
    position INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(
        type IN ('title','text','tip','advice','warning','list','secret','photo','audio','video')
    ),
    key_label TEXT DEFAULT NULL, -- Utilisé pour le type 'secret' (ex: "Code Boîte à clés")
    content TEXT NOT NULL,       -- Texte brut ou HTML inline sécurisé (<b>, <i>, <u>, <mark>), ou lignes séparées par \n pour 'list'
    media_url TEXT DEFAULT NULL,
    duration TEXT DEFAULT NULL,
    FOREIGN KEY (fiche_id) REFERENCES fiches(id) ON DELETE CASCADE
);

CREATE INDEX idx_fiche_blocks_order ON fiche_blocks(fiche_id, position);
```

---

## 4. Architecture Hypermedia : Routes HTMX + PHP 8

| Méthode | Route | Action côté serveur (PHP) | Retour HTML (Fragment HTMX) |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/fiches/{id}?mode=edit\|preview` | Charge la fiche dans le mode demandé | `#phone-bento-canvas` |
| `POST` | `/api/fiches/{id}/blocs` | Décale `position >= :pos` de `+1` et insère le nouveau bloc | `#phone-bento-canvas` |
| `PATCH` | `/api/blocs/{id}` | Sauvegarde le texte (nettoyé avec `strip_tags` autorisant `<b><i><u><mark>`) | `204 No Content` + Toast |
| `PATCH` | `/api/blocs/{id}/convert` | Convertit la sémantique du bloc (`text` ↔ `list` ↔ `tip` ↔ `title`...) | `#bento-card-{id}` (`outerHTML`) |
| `PATCH` | `/api/blocs/{id}/move?dir=up\|down` | Échange la `position` avec le bloc adjacent | `#phone-bento-canvas` |
| `POST` | `/api/fiches/{id}/reorder` | Réindexe les positions après un Drag & Drop | `#phone-bento-canvas` |
| `DELETE`| `/api/blocs/{id}` | Supprime le bloc après confirmation dans la modale | `#phone-bento-canvas` |

---

## 5. Logique PHP de Conversion & Nettoyage Inline (`BlockConverter.php`)

```php
<?php
declare(strict_types=1);

namespace EasyHomeGuide\Editor;

class BlockConverter
{
    /**
     * Conserve uniquement la dynamique de texte issue de la mini-barre (Gras, Italique, Souligné, Surligné).
     */
    public static function sanitizeInlineFormatting(string $html): string
    {
        return trim(strip_tags($html, '<b><strong><i><em><u><mark><br>'));
    }

    /**
     * Convertit intelligemment le contenu d'un bloc textuel vers n'importe quel autre type textuel
     * sans jamais perdre l'information saisie par l'hôte.
     */
    public static function convertContent(string $content, string $fromType, string $toType): string
    {
        $plain = trim(strip_tags($content));

        // Passage d'un paragraphe vers une Liste à puces : découpage des phrases en étapes
        if ($toType === 'list' && $fromType !== 'list') {
            if (!str_contains($plain, "\n") && str_contains($plain, '. ')) {
                $sentences = preg_split('/\.\s+/', $plain, -1, PREG_SPLIT_NO_EMPTY);
                $cleanSentences = array_map(fn($s) => rtrim(trim($s), '.'), $sentences);
                return implode("\n", array_filter($cleanSentences));
            }
            return $plain ?: "Première étape\nDeuxième étape";
        }

        // Passage d'une Liste à puces vers un paragraphe (Texte, Astuce, Conseil, Consigne, Titre)
        if ($fromType === 'list' && $toType !== 'list') {
            $lines = array_filter(array_map('trim', explode("\n", $plain)));
            return implode('. ', $lines) . (count($lines) > 0 ? '.' : '');
        }

        if ($toType === 'secret') {
            return $plain;
        }

        return self::sanitizeInlineFormatting($content);
    }
}
```