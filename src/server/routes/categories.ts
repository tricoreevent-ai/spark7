import express from 'express';
import { Category } from '../models/Category.js';
import { authMiddleware as authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get all active categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching categories' });
  }
});

// Create a new category
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    const existingCategory = await Category.findOne({ 
      name: { $regex: new RegExp(`^${name}$`, 'i') } 
    });
    
    if (existingCategory) {
      if (!existingCategory.isActive) {
        existingCategory.isActive = true;
        existingCategory.description = description;
        await existingCategory.save();
        return res.status(200).json(existingCategory);
      }
      return res.status(400).json({ error: 'Category already exists' });
    }

    const category = new Category({ name, description });
    await category.save();
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: 'Error creating category' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    category.isActive = false;
    await category.save();
    res.json({ success: true, message: 'Category deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting category' });
  }
});

export default router;
