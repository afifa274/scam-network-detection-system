"""
Train the scam/spam classifier and save the model artifacts.

Usage (from the backend/ml_model directory):
    python train_model.py

Or from the repo root:
    python backend/ml_model/train_model.py
"""

import os
import sys
import pickle
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report,
    accuracy_score,
    confusion_matrix,
)

# ---------------------------------------------------------------------------
# Resolve dataset path relative to this file so the script works from any cwd
# ---------------------------------------------------------------------------
THIS_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_PATH = os.path.join(THIS_DIR, "..", "..", "datasets", "raw", "spam.csv")
MODEL_OUT = os.path.join(THIS_DIR, "scam_model.pkl")
VEC_OUT = os.path.join(THIS_DIR, "vectorizer.pkl")


def load_data(path: str) -> pd.DataFrame:
    # The spam.csv has 5 columns; only the first two are useful
    df = pd.read_csv(path, header=None, encoding="latin-1")
    df = df.iloc[:, :2]
    df.columns = ["label", "message"]
    df.dropna(subset=["message"], inplace=True)
    df["label"] = df["label"].str.strip().str.lower()
    print(f"[data] loaded {len(df)} rows  |  label counts:\n{df['label'].value_counts().to_string()}")
    return df


def train(df: pd.DataFrame):
    X = df["message"]
    y = df["label"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    print(f"\n[split] train={len(X_train)}  test={len(X_test)}")

    vectorizer = TfidfVectorizer(
        ngram_range=(1, 2),      # unigrams + bigrams
        max_features=20_000,
        sublinear_tf=True,       # apply log(1+tf) dampening
        strip_accents="unicode",
        analyzer="word",
        min_df=2,
    )
    X_train_vec = vectorizer.fit_transform(X_train)
    X_test_vec = vectorizer.transform(X_test)

    model = LogisticRegression(
        C=5.0,
        solver="lbfgs",
        max_iter=1000,
        class_weight="balanced",
        random_state=42,
    )
    model.fit(X_train_vec, y_train)

    # Evaluation
    y_pred = model.predict(X_test_vec)
    acc = accuracy_score(y_test, y_pred)
    print(f"\n[eval] Accuracy: {acc * 100:.2f}%")
    print("\n[eval] Classification Report:")
    print(classification_report(y_test, y_pred))
    print("[eval] Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    return model, vectorizer


def save_artifacts(model, vectorizer):
    with open(MODEL_OUT, "wb") as f:
        pickle.dump(model, f)
    with open(VEC_OUT, "wb") as f:
        pickle.dump(vectorizer, f)
    print(f"\n[save] model    → {MODEL_OUT}")
    print(f"[save] vectorizer → {VEC_OUT}")


if __name__ == "__main__":
    if not os.path.exists(DATASET_PATH):
        print(f"[error] Dataset not found at: {DATASET_PATH}", file=sys.stderr)
        sys.exit(1)

    df = load_data(DATASET_PATH)
    model, vectorizer = train(df)
    save_artifacts(model, vectorizer)
    print("\n✅ Model trained and saved successfully!")
