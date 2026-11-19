'use strict';

const API_URL = '/api/products';

const elements = {
  form: document.getElementById('productForm'),
  formTitle: document.getElementById('formTitle'),
  submitBtn: document.getElementById('submitBtn'),
  cancelEditBtn: document.getElementById('cancelEditBtn'),
  nome: document.getElementById('nome'),
  preco: document.getElementById('preco'),
  estoque: document.getElementById('estoque'),
  validade: document.getElementById('validade'),
  searchInput: document.getElementById('searchInput'),
  tableBody: document.getElementById('productTableBody'),
  tableWrap: document.getElementById('tableWrap'),
  emptyState: document.getElementById('emptyState'),
  loadingState: document.getElementById('loadingState'),
  totalProducts: document.getElementById('totalProducts'),
  inventoryCount: document.getElementById('inventoryCount'),
  tableSummary: document.getElementById('tableSummary'),
  deleteModal: document.getElementById('deleteModal'),
  deleteItemName: document.getElementById('deleteItemName'),
  cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
  confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
  toast: document.getElementById('toast'),
  toastMessage: document.getElementById('toastMessage'),
  todayLabel: document.getElementById('todayLabel')
};

let products = [];
let editingId = null;
let deletingId = null;
let toastTimeout = null;

function showToast(message, isError = false) {
  elements.toastMessage.textContent = message;
  elements.toast.classList.toggle('error', isError);
  const icon = elements.toast.querySelector('i');
  icon.className = isError ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check';
  elements.toast.classList.add('show');
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => elements.toast.classList.remove('show'), 3400);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const responseText = await response.text();
  let result = null;
  if (responseText) {
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error('O servidor retornou uma resposta inválida.');
    }
  }

  if (!response.ok) {
    throw new Error(result?.error || `Erro na comunicação com o servidor (${response.status}).`);
  }
  return result;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

function formatDate(dateString) {
  if (!dateString) return '—';
  const [year, month, day] = String(dateString).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function getExpiryStatus(dateString) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${String(dateString).slice(0, 10)}T00:00:00`);
  const days = Math.round((expiry.getTime() - today.getTime()) / 86400000);

  if (Number.isNaN(days)) return { label: 'Data inválida', className: 'expiry-expired' };
  if (days < 0) return { label: 'Vencido', className: 'expiry-expired' };
  if (days <= 7) return { label: 'Próx. vencimento', className: 'expiry-soon' };
  return { label: formatDate(dateString), className: 'expiry-valid' };
}

function makeCell(className = '') {
  const cell = document.createElement('td');
  if (className) cell.className = className;
  return cell;
}

function makeActionButton(label, iconClass, className, action, id) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-button ${className}`;
  button.title = label;
  button.setAttribute('aria-label', `${label}: ${id}`);
  button.dataset.action = action;
  button.dataset.id = id;
  const icon = document.createElement('i');
  icon.className = iconClass;
  icon.setAttribute('aria-hidden', 'true');
  button.appendChild(icon);
  return button;
}

function renderTable(filter = '') {
  const normalizedFilter = filter.trim().toLocaleLowerCase('pt-BR');
  const filteredProducts = products.filter(product =>
    String(product.nome).toLocaleLowerCase('pt-BR').includes(normalizedFilter)
  );

  elements.tableBody.replaceChildren();
  elements.totalProducts.textContent = String(products.length);
  elements.inventoryCount.textContent = `${products.length} ${products.length === 1 ? 'item' : 'itens'}`;
  elements.tableSummary.textContent = `Mostrando ${filteredProducts.length} de ${products.length} produtos`;

  const hasProducts = filteredProducts.length > 0;
  elements.emptyState.querySelector('h3').textContent = 'Nenhum produto encontrado';
  elements.emptyState.querySelector('p').textContent = 'Cadastre um produto ou tente outra busca.';
  elements.emptyState.classList.toggle('hidden', hasProducts);
  elements.tableWrap.classList.toggle('hidden', !hasProducts);

  for (const product of filteredProducts) {
    const row = document.createElement('tr');

    const nameCell = makeCell();
    const name = document.createElement('div');
    name.className = 'product-name';
    name.textContent = product.nome;
    nameCell.appendChild(name);

    const nameSubtitle = document.createElement('div');
    nameSubtitle.className = 'product-subtitle';
    nameSubtitle.textContent = `Código: ${String(product.id).slice(0, 8)}`;
    nameCell.appendChild(nameSubtitle);

    const priceCell = makeCell('align-right price-cell');
    priceCell.textContent = formatCurrency(product.preco);

    const stockCell = makeCell('align-center');
    const stockPill = document.createElement('span');
    stockPill.className = `stock-pill ${Number(product.estoque) <= 5 ? 'stock-low' : 'stock-normal'}`;
    stockPill.textContent = `${product.estoque} un.`;
    stockCell.appendChild(stockPill);

    const expiryCell = makeCell('align-center');
    const status = getExpiryStatus(product.validade);
    const expiryPill = document.createElement('span');
    expiryPill.className = `expiry-pill ${status.className}`;
    expiryPill.textContent = status.label;
    expiryCell.appendChild(expiryPill);

    const actionsCell = makeCell('align-center');
    const actionGroup = document.createElement('div');
    actionGroup.className = 'action-group';
    actionGroup.append(
      makeActionButton('Editar', 'fa-solid fa-pen', 'edit-button', 'edit', product.id),
      makeActionButton('Excluir', 'fa-solid fa-trash-can', 'delete-button', 'delete', product.id)
    );
    actionsCell.appendChild(actionGroup);

    row.append(nameCell, priceCell, stockCell, expiryCell, actionsCell);
    elements.tableBody.appendChild(row);
  }
}

async function loadProducts() {
  elements.loadingState.classList.remove('hidden');
  elements.tableWrap.classList.add('hidden');
  elements.emptyState.classList.add('hidden');

  try {
    const result = await apiRequest(API_URL);
    products = Array.isArray(result) ? result : [];
    renderTable(elements.searchInput.value);
  } catch (error) {
    showToast(error.message || 'Não foi possível carregar os produtos.', true);
    elements.emptyState.classList.remove('hidden');
    elements.emptyState.querySelector('h3').textContent = 'Não foi possível carregar os produtos';
    elements.emptyState.querySelector('p').textContent = 'Confira a configuração do banco de dados e tente novamente.';
  } finally {
    elements.loadingState.classList.add('hidden');
  }
}

function getFormData() {
  return {
    nome: elements.nome.value.trim(),
    preco: Number(elements.preco.value),
    estoque: Number(elements.estoque.value),
    validade: elements.validade.value
  };
}

function validateForm(data) {
  if (!data.nome || data.nome.length > 120) {
    showToast('Informe um nome de produto com até 120 caracteres.', true);
    elements.nome.focus();
    return false;
  }
  if (!Number.isFinite(data.preco) || data.preco < 0) {
    showToast('Informe um preço válido.', true);
    elements.preco.focus();
    return false;
  }
  if (!Number.isInteger(data.estoque) || data.estoque < 0) {
    showToast('A quantidade deve ser um número inteiro igual ou maior que zero.', true);
    elements.estoque.focus();
    return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.validade)) {
    showToast('Informe uma data de validade válida.', true);
    elements.validade.focus();
    return false;
  }
  return true;
}

function resetForm() {
  editingId = null;
  elements.form.reset();
  elements.formTitle.textContent = 'Cadastrar produto';
  elements.submitBtn.innerHTML = '<i class="fa-solid fa-plus" aria-hidden="true"></i><span>Cadastrar produto</span>';
  elements.cancelEditBtn.classList.add('hidden');
}

async function handleSubmit(event) {
  event.preventDefault();
  const data = getFormData();
  if (!validateForm(data)) return;

  const wasEditing = Boolean(editingId);
  const url = wasEditing ? `${API_URL}?id=${encodeURIComponent(editingId)}` : API_URL;
  const originalLabel = elements.submitBtn.innerHTML;
  elements.submitBtn.disabled = true;
  elements.submitBtn.textContent = wasEditing ? 'Salvando...' : 'Cadastrando...';

  try {
    await apiRequest(url, {
      method: wasEditing ? 'PATCH' : 'POST',
      body: JSON.stringify(data)
    });
    resetForm();
    await loadProducts();
    showToast(wasEditing ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!');
    elements.nome.focus();
  } catch (error) {
    showToast(error.message || 'Não foi possível salvar o produto.', true);
  } finally {
    elements.submitBtn.disabled = false;
    if (editingId) {
      elements.submitBtn.innerHTML = originalLabel;
    } else if (elements.submitBtn.textContent === 'Cadastrando...' || elements.submitBtn.textContent === 'Salvando...') {
      elements.submitBtn.innerHTML = originalLabel;
    }
  }
}

function handleEdit(id) {
  const product = products.find(item => String(item.id) === String(id));
  if (!product) {
    showToast('Produto não encontrado. Atualize a lista e tente novamente.', true);
    return;
  }

  editingId = product.id;
  elements.nome.value = product.nome;
  elements.preco.value = Number(product.preco).toFixed(2);
  elements.estoque.value = product.estoque;
  elements.validade.value = String(product.validade).slice(0, 10);
  elements.formTitle.textContent = 'Editar produto';
  elements.submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk" aria-hidden="true"></i><span>Salvar alterações</span>';
  elements.cancelEditBtn.classList.remove('hidden');
  elements.nome.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openDeleteModal(id) {
  const product = products.find(item => String(item.id) === String(id));
  if (!product) return;
  deletingId = product.id;
  elements.deleteItemName.textContent = product.nome;
  elements.deleteModal.classList.remove('hidden');
  elements.cancelDeleteBtn.focus();
}

function closeDeleteModal() {
  deletingId = null;
  elements.deleteModal.classList.add('hidden');
}

async function executeDelete() {
  if (!deletingId) return;
  const id = deletingId;
  elements.confirmDeleteBtn.disabled = true;
  elements.confirmDeleteBtn.textContent = 'Excluindo...';

  try {
    await apiRequest(`${API_URL}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    closeDeleteModal();
    await loadProducts();
    showToast('Produto excluído com sucesso!');
  } catch (error) {
    showToast(error.message || 'Não foi possível excluir o produto.', true);
  } finally {
    elements.confirmDeleteBtn.disabled = false;
    elements.confirmDeleteBtn.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i> Excluir';
  }
}

function initializeDate() {
  elements.todayLabel.textContent = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric'
  }).format(new Date());
}

// Eventos da interface.
elements.form.addEventListener('submit', handleSubmit);
elements.cancelEditBtn.addEventListener('click', resetForm);
elements.searchInput.addEventListener('input', event => renderTable(event.target.value));
elements.cancelDeleteBtn.addEventListener('click', closeDeleteModal);
elements.confirmDeleteBtn.addEventListener('click', executeDelete);
elements.deleteModal.addEventListener('click', event => {
  if (event.target.matches('[data-close-modal]')) closeDeleteModal();
});
elements.tableBody.addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.dataset.action === 'edit') handleEdit(button.dataset.id);
  if (button.dataset.action === 'delete') openDeleteModal(button.dataset.id);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !elements.deleteModal.classList.contains('hidden')) closeDeleteModal();
});

initializeDate();
loadProducts();
