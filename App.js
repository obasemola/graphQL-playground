require('dotenv').config()
const { ApolloServer, UserInputError, gql } = require('apollo-server')
const mongoose = require('mongoose')
const Book = require('./models/Book')
const Author = require('./models/Author')
const { v1: uuid } = require('uuid')

const url = process.env.MONGODB_URI

console.log('connecting to', url)

mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connecting to MongoDB:', error.message)
  })


let authors = [
  {
    name: 'Robert Martin',
    id: "afa51ab0-344d-11e9-a414-719c6709cf3e",
    born: 1952,
  },
  {
    name: 'Martin Fowler',
    id: "afa5b6f0-344d-11e9-a414-719c6709cf3e",
    born: 1963
  },
  {
    name: 'Fyodor Dostoevsky',
    id: "afa5b6f1-344d-11e9-a414-719c6709cf3e",
    born: 1821
  },
  { 
    name: 'Joshua Kerievsky', // birthyear not known
    id: "afa5b6f2-344d-11e9-a414-719c6709cf3e",
  },
  { 
    name: 'Sandi Metz', // birthyear not known
    id: "afa5b6f3-344d-11e9-a414-719c6709cf3e",
  },
]

/*
 * Saattaisi olla järkevämpää assosioida kirja ja sen tekijä tallettamalla kirjan yhteyteen tekijän nimen sijaan tekijän id
 * Yksinkertaisuuden vuoksi tallennamme kuitenkin kirjan yhteyteen tekijän nimen
*/


const typeDefs = gql`

  type Author {
    name: String!
    bookCount: Int!
    born: Int
    id: ID!
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    id: ID!
    genres: [String!]!
  }

  type Query {
    authorCount: Int!
    bookCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
  }

  type Mutation {
    addBook (
      title: String!
      published: Int!
      author: String!
      genres: [String!]!
    ): Book
    editAuthor(name: String!, setBornTo: Int!): Author
  }
`

const resolvers = {
  Query: {
    authorCount: () => Author.collection.countDocuments(),
    bookCount: () => Book.collection.countDocuments(),
    allBooks: (root, args) => {
      if(!args.author && !args.genre){
        return books
      }

      let returnedBooks = Book.find({}).then((books) => {
        books.map((book) => {
          if(args.author === book.author){
            return book
          }else if(book.genres.includes(args.genre)){
            return book
          }
        })
      })

      returnedBooks = returnedBooks.filter(authorBook => authorBook !== undefined)
      return returnedBooks.populate('author', { name: 1, born: 1 })

    },
    allAuthors: () => Author.find({})
  },

  Author: {
    bookCount: (root) => {
      let count = 0
      Book.find({}).then((books) => {
        books.map((book) => {
          if(root.name === book.author){
            count = count + 1
          }
        })
      })
      // books.map((book) => {
      //   if(root.name === book.author){
      //     count = count + 1
      //   }
      // })
      return count
    }
  },

  Mutation: {
    addBook: async (root, args) => {
      const authorObject = await Author.findOne({ name: args.author })
      if(!authorObject){
        const newAuthor = new Author({ name: args.author })
        await newAuthor.save()

        const savedAuthorObject = await Author.findOne({ name: args.author })
        const book = new Book({
          ...args,
          author: savedAuthorObject })
          return await book.save()
      }

      const book = new Book({
        ...args,
        author: authorObject })
      
      return await book.save()
    },

    editAuthor: (root, args) => {
      const author = authors.find(a => a.name === args.name)
      if(!author){
        return null
      }

      const updatedAuthor = { ...author, born: args.setBornTo }
      authors = authors.map(author => author.name === args.name ? updatedAuthor : author)
      return updatedAuthor
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})